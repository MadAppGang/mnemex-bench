# claudemem benchmark-v2: Code Digest for Review

## Purpose
Review the benchmark-v2 system's embedding evaluation methodology.
Propose improvements for comparing embedding models for semantic code search.

## Current Architecture
- benchmark-v2 evaluates LLM-generated code summaries
- Embedding model is used as infrastructure for retrieval + contrastive evaluation
- Cross-model competition: all models' summaries indexed together, ranked per query

## Recent Benchmark Results (embedding comparison)
Tested 9 embedding models on 1147 summaries, 296 queries, 37 code units (single codebase):

| Model | Dim | P@1 | P@5 | MRR |
|-------|-----|-----|-----|-----|
| nomic-embed-code | 3584 | .932 | .976 | .954 |
| mxbai-embed-large-v1 | 1024 | .932 | .976 | .952 |
| snowflake-arctic-embed2 | 1024 | .922 | .963 | .942 |
| mxbai-embed-xsmall-v1 | 384 | .889 | .963 | .923 |
| snowflake-arctic-embed-l-v2.0 | 384 | .889 | .963 | .923 |
| nomicai-modernbert-embed-base | 384 | .889 | .963 | .923 |
| embeddinggemma-300m | 768 | .865 | .970 | .911 |
| qwen3-embedding-0.6b | 1024 | .872 | .946 | .903 |
| nomic-embed-text | 768 | .716 | .848 | .772 |

## Problem
- Test was on single codebase (claudemem itself)
- MTEB/CoIR scores don't match our real-world results
- qwen3-embedding-0.6b ranked 8th despite being MTEB-Code #1 family
- Need proper multi-codebase evaluation

---

## Key Source Files


### `src/benchmark-v2/evaluators/retrieval/index.ts`
```typescript
/**
 * Retrieval Evaluator
 *
 * Evaluates how well summaries help retrieve the correct code
 * when searching with natural language queries.
 *
 * Metrics:
 * - Precision@K (P@K): Did target appear in top K results?
 * - Mean Reciprocal Rank (MRR): 1/rank of target
 */

import { randomUUID } from "crypto";
import type {
	IEmbeddingsClient,
	LLMMessage,
	ILLMClient,
} from "../../../types.js";
import type {
	BenchmarkCodeUnit,
	GeneratedSummary,
	GeneratedQuery,
	EvaluationResult,
	RetrievalResults,
	EvaluatorContext,
	QueryType,
} from "../../types.js";
import { BaseEvaluator } from "../base.js";
import { RetrievalError } from "../../errors.js";
import { createQueryGenerator } from "../../extractors/query-generator.js";
import type { PhaseContext, PhaseResult } from "../../pipeline/orchestrator.js";

// ============================================================================
// Vector Index (Simple In-Memory)
// ============================================================================

interface IndexEntry {
	summaryId: string;
	codeUnitId: string;
	modelId: string;
	embedding: number[];
}

class SimpleVectorIndex {
	private entries: IndexEntry[] = [];

	add(
		summaryId: string,
		codeUnitId: string,
		modelId: string,
		embedding: number[],
	): void {
		this.entries.push({ summaryId, codeUnitId, modelId, embedding });
	}

	/**
	 * Search and return results with model information
	 */
	search(
		queryEmbedding: number[],
		k: number,
	): Array<{ codeUnitId: string; modelId: string; score: number }> {
		// Calculate similarities
		const similarities = this.entries.map((entry) => ({
			codeUnitId: entry.codeUnitId,
			modelId: entry.modelId,
			score: this.cosineSimilarity(queryEmbedding, entry.embedding),
		}));

		// Sort by similarity (descending) and take top K
		return similarities.sort((a, b) => b.score - a.score).slice(0, k);
	}

	/**
	 * Search for a specific code unit across all models
	 * Returns the rank of each model's summary for this code unit
	 */
	searchWithModelRanks(
		queryEmbedding: number[],
		targetCodeUnitId: string,
	): Map<string, { rank: number; score: number }> {
		// Calculate all similarities
		const similarities = this.entries.map((entry) => ({
			codeUnitId: entry.codeUnitId,
			modelId: entry.modelId,
			score: this.cosineSimilarity(queryEmbedding, entry.embedding),
		}));

		// Sort by similarity (descending)
		similarities.sort((a, b) => b.score - a.score);

		// Find rank of each model's summary for the target code unit
		const modelRanks = new Map<string, { rank: number; score: number }>();

		for (let i = 0; i < similarities.length; i++) {
			const entry = similarities[i];
			if (entry.codeUnitId === targetCodeUnitId) {
				// First occurrence of this model for this code unit
				if (!modelRanks.has(entry.modelId)) {
					modelRanks.set(entry.modelId, {
						rank: i + 1, // 1-indexed rank
						score: entry.score,
					});
				}
			}
		}

		return modelRanks;
	}

	private cosineSimilarity(a: number[], b: number[]): number {
		let dot = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dot += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denom = Math.sqrt(normA) * Math.sqrt(normB);
		return denom > 0 ? dot / denom : 0;
	}

	clear(): void {
		this.entries = [];
	}

	size(): number {
		return this.entries.length;
	}

	getModelCount(): number {
		return new Set(this.entries.map((e) => e.modelId)).size;
	}
}

// ============================================================================
// Retrieval Evaluator
// ============================================================================

export interface RetrievalEvaluatorOptions {
	embeddingsClient: IEmbeddingsClient;
	kValues: number[];
}

export class RetrievalEvaluator extends BaseEvaluator<EvaluationResult[]> {
	private embeddingsClient: IEmbeddingsClient;
	private kValues: number[];
	private index: SimpleVectorIndex;
	private modelIds: string[] = [];

	constructor(options: RetrievalEvaluatorOptions) {
		super();
		this.embeddingsClient = options.embeddingsClient;
		this.kValues = options.kValues;
		this.index = new SimpleVectorIndex();
	}

	/**
	 * Build a COMBINED index from ALL models' summaries
	 * This enables cross-model competition where models compete to have
	 * their summaries rank highest for each query.
	 *
	 * @param onProgress Optional callback for progress updates during embedding
	 */
	async buildCombinedIndex(
		summariesByModel: Map<string, GeneratedSummary[]>,
		onProgress?: (message: string) => void,
	): Promise<void> {
		this.index.clear();
		this.modelIds = Array.from(summariesByModel.keys());

		// Collect all summaries with their model IDs
		const allSummaries: Array<{ summary: GeneratedSummary; modelId: string }> =
			[];
		for (const [modelId, summaries] of summariesByModel) {
			for (const summary of summaries) {
				allSummaries.push({ summary, modelId });
			}
		}

		const total = allSummaries.length;
		onProgress?.(`Embedding ${total} summaries...`);

		// Embed in batches for progress visibility
		const BATCH_SIZE = 50;
		const texts = allSummaries.map((s) => s.summary.summary);
		const allEmbeddings: number[][] = [];

		for (let i = 0; i < texts.length; i += BATCH_SIZE) {
			const batchEnd = Math.min(i + BATCH_SIZE, texts.length);
			const batchTexts = texts.slice(i, batchEnd);

			onProgress?.(`Embedding ${batchEnd}/${total} summaries...`);
			const embedResult = await this.embeddingsClient.embed(batchTexts);
			allEmbeddings.push(...embedResult.embeddings);
		}

		onProgress?.(`Indexing ${total} summaries...`);
		for (let i = 0; i < allSummaries.length; i++) {
			const { summary, modelId } = allSummaries[i];
			this.index.add(summary.id, summary.codeUnitId, modelId, allEmbeddings[i]);
		}
	}

	/**
	 * Build index for a single model (legacy compatibility)
	 */
	async buildIndex(summaries: GeneratedSummary[]): Promise<void> {
		this.index.clear();
		const modelId = summaries[0]?.modelId || "unknown";
		this.modelIds = [modelId];

		const texts = summaries.map((s) => s.summary);
		const embedResult = await this.embeddingsClient.embed(texts);

		for (let i = 0; i < summaries.length; i++) {
			this.index.add(
				summaries[i].id,
				summaries[i].codeUnitId,
				modelId,
				embedResult.embeddings[i],
			);
		}
	}

	/**
	 * Evaluate retrieval with cross-model competition
	 * Returns results for ALL models for a single query
	 */
	async evaluateQueryCrossModel(
		query: GeneratedQuery,
		summariesByModel: Map<string, GeneratedSummary[]>,
	): Promise<EvaluationResult[]> {
		// Embed the query
		const queryEmbedding = await this.embeddingsClient.embedOne(query.query);

		// Get ranks for all models
		const modelRanks = this.index.searchWithModelRanks(
			queryEmbedding,
			query.codeUnitId,
		);

		// Total items in index (for calculating relative rank)
		const totalItems = this.index.size();
		const numModels = this.index.getModelCount();

		// Create a result for each model
		const results: EvaluationResult[] = [];

		for (const [modelId, summaries] of summariesByModel) {
			const rankInfo = modelRanks.get(modelId);

			// If this model doesn't have a summary for this code unit, skip
			if (!rankInfo) continue;

			const rank = rankInfo.rank;

			// Calculate hit@K for each K value
			// Note: K is now relative to ALL summaries in the combined index
			const hitAtK: Record<number, boolean> = {};
			for (const k of this.kValues) {
				hitAtK[k] = rank <= k;
			}

			// Calculate "model rank" - which model ranked highest among models?
			// Sort all models by their rank for this query
			const sortedModels = Array.from(modelRanks.entries()).sort(
				(a, b) => a[1].rank - b[1].rank,
			);
			const modelPosition = sortedModels.findIndex(([m]) => m === modelId) + 1;

			// Find the summary for this code unit from this model
			const targetSummary = summaries.find(
				(s) => s.codeUnitId === query.codeUnitId,
			);
			if (!targetSummary) continue;

			const retrievalResults: RetrievalResults = {
				queryId: query.id,
				queryType: query.type,
				query: query.query,
				hitAtK,
				reciprocalRank: 1 / rank,
				retrievedRank: rank,
				// New fields for cross-model competition
				modelRank: modelPosition, // 1 = best among models
				totalModels: numModels,
				isWinner: modelPosition === 1,
				poolSize: totalItems,
			};

			results.push({
				id: randomUUID(),
				summaryId: targetSummary.id,
				evaluationType: "retrieval",
				retrievalResults,
				evaluatedAt: new Date().toISOString(),
			});
		}

		return results;
	}

	/**
	 * Evaluate retrieval for a single query (single model, legacy)
	 */
	async evaluateQuery(
		query: GeneratedQuery,
		modelId: string,
		summaries: GeneratedSummary[],
	): Promise<EvaluationResult> {
		// Embed the query
		const queryEmbedding = await this.embeddingsClient.embedOne(query.query);

		// Search the index
		const maxK = Math.max(...this.kValues);
		const results = this.index.search(queryEmbedding, maxK);

		// Find rank of target (first match for this code unit)
		const targetRank =
			results.findIndex((r) => r.codeUnitId === query.codeUnitId) + 1;

		// Calculate hit@K for each K value
		const hitAtK: Record<number, boolean> = {};
		for (const k of this.kValues) {
			hitAtK[k] = targetRank > 0 && targetRank <= k;
		}

		const retrievalResults: RetrievalResults = {
			queryId: query.id,
			queryType: query.type,
			query: query.query,
			hitAtK,
			reciprocalRank: targetRank > 0 ? 1 / targetRank : 0,
			retrievedRank: targetRank > 0 ? targetRank : null,
		};

		// Find a representative summary for the foreign key
		const targetSummary =
			summaries.find((s) => s.codeUnitId === query.codeUnitId) || summaries[0];

		if (!targetSummary) {
			throw new RetrievalError(`No summary found for model ${modelId}`);
		}

		return {
			id: randomUUID(),
			summaryId: targetSummary.id,
			evaluationType: "retrieval",
			retrievalResults,
			evaluatedAt: new Date().toISOString(),
		};
	}

	/**
	 * Evaluate retrieval for all queries
	 */
	async evaluate(
		_summary: GeneratedSummary,
		_codeUnit: BenchmarkCodeUnit,
		context: EvaluatorContext,
	): Promise<EvaluationResult[]> {
		const queries = context.queries || [];
		const results: EvaluationResult[] = [];

		for (const query of queries) {
			try {
				const result = await this.evaluateQuery(query, "combined", []);
				results.push(result);
			} catch (error) {
				// Skip silently to not disrupt progress bar
			}
		}

		return results;
	}

	getType() {
		return "retrieval" as const;
	}
}

// ============================================================================
// Aggregated Retrieval Metrics
// ============================================================================

export interface AggregatedRetrievalMetrics {
	modelId: string;
	precision: Record<number, number>;
	mrr: number;
	/** Win rate: How often did this model's summary rank #1 among all models? */
	winRate: number;
	/** Average model rank (1 = best, lower is better) */
	avgModelRank: number;
	byQueryType: Record<
		QueryType,
		{
			precision: Record<number, number>;
			mrr: number;
			winRate: number;
			count: number;
		}
	>;
}

export function aggregateRetrievalResults(
	results: RetrievalResults[],
	kValues: number[],
): AggregatedRetrievalMetrics {
	if (results.length === 0) {
		return {
			modelId: "",
			precision: Object.fromEntries(kValues.map((k) => [k, 0])),
			mrr: 0,
			winRate: 0,
			avgModelRank: 0,
			byQueryType: {} as any,
		};
	}

	// Calculate overall precision@K
	const precision: Record<number, number> = {};
	for (const k of kValues) {
		const hits = results.filter((r) => r.hitAtK[k]).length;
		precision[k] = hits / results.length;
	}

	// Calculate MRR
	const mrr =
		results.reduce((sum, r) => sum + r.reciprocalRank, 0) / results.length;

	// Calculate win rate (cross-model competition)
	const resultsWithModelRank = results.filter((r) => r.modelRank !== undefined);
	const winRate =
		resultsWithModelRank.length > 0
			? resultsWithModelRank.filter((r) => r.isWinner).length /
				resultsWithModelRank.length
			: 0;

	// Calculate average model rank
	const avgModelRank =
		resultsWithModelRank.length > 0
			? resultsWithModelRank.reduce((sum, r) => sum + (r.modelRank || 0), 0) /
				resultsWithModelRank.length
			: 0;

	// Group by query type
	const byType = new Map<QueryType, RetrievalResults[]>();
	for (const result of results) {
		const type = result.queryType as QueryType;
		if (!byType.has(type)) {
			byType.set(type, []);
		}
		byType.get(type)!.push(result);
	}

	const byQueryType: AggregatedRetrievalMetrics["byQueryType"] = {} as any;
	for (const [type, typeResults] of byType) {
		const typePrecision: Record<number, number> = {};
		for (const k of kValues) {
			const hits = typeResults.filter((r) => r.hitAtK[k]).length;
			typePrecision[k] = hits / typeResults.length;
		}

		const typeResultsWithRank = typeResults.filter(
			(r) => r.modelRank !== undefined,
		);
		const typeWinRate =
			typeResultsWithRank.length > 0
				? typeResultsWithRank.filter((r) => r.isWinner).length /
					typeResultsWithRank.length
				: 0;

		byQueryType[type] = {
			precision: typePrecision,
			mrr:
				typeResults.reduce((sum, r) => sum + r.reciprocalRank, 0) /
				typeResults.length,
			winRate: typeWinRate,
			count: typeResults.length,
		};
	}

	return {
		modelId: "",
		precision,
		mrr,
		winRate,
		avgModelRank,
		byQueryType,
	};
}

// ============================================================================
// Factory Function
// ============================================================================

export function createRetrievalEvaluator(
	options: RetrievalEvaluatorOptions,
): RetrievalEvaluator {
	return new RetrievalEvaluator(options);
}

// ============================================================================
// Phase Executor
// ============================================================================

/**
 * Create the retrieval evaluation phase executor
 *
 * Uses CROSS-MODEL COMPETITION: All models' summaries are indexed together.
 * For each query, we measure which model's summary ranks highest.
 * This provides much better model discrimination than per-model indexing.
 */
export function createRetrievalPhaseExecutor(
	embeddingsClient: IEmbeddingsClient,
	llmClient?: ILLMClient,
): (context: PhaseContext) => Promise<PhaseResult> {
	return async (context: PhaseContext): Promise<PhaseResult> => {
		const { db, run, config, stateMachine } = context;
		const evalConfig = config.evaluation.retrieval;

		if (!evalConfig.enabled) {
			return { success: true, itemsProcessed: 0 };
		}

		try {
			// Get data
			const summaries = db.getSummaries(run.id);
			const codeUnits = db.getCodeUnits(run.id);

			// Group summaries by model
			const summariesByModel = new Map<string, GeneratedSummary[]>();
			for (const summary of summaries) {
				if (!summariesByModel.has(summary.modelId)) {
					summariesByModel.set(summary.modelId, []);
				}
				summariesByModel.get(summary.modelId)!.push(summary);
			}

			const numModels = summariesByModel.size;

			// Resume support: get existing evaluation results
			const existingResults = db.getEvaluationResults(run.id, "retrieval");
			const evaluatedRetrieval = new Set<string>(); // key: queryId (all models evaluated together)
			// Count how many results exist per query - a query is complete when it has numModels results
			const resultCountByQuery = new Map<string, number>();
			for (const result of existingResults) {
				if (result.retrievalResults) {
					const queryId = result.retrievalResults.queryId;
					resultCountByQuery.set(
						queryId,
						(resultCountByQuery.get(queryId) || 0) + 1,
					);
				}
			}
			// Mark queries as evaluated if they have results for all models
			for (const [queryId, count] of resultCountByQuery) {
				if (count >= numModels) {
					evaluatedRetrieval.add(queryId);
				}
			}

			// Generate queries if needed
			let queries = db.getQueries(run.id);
			if (queries.length === 0) {
				stateMachine.startPhase("evaluation:retrieval", 0);
				stateMachine.updateProgress(
					"evaluation:retrieval",
					0,
					undefined,
					"Generating search queries...",
				);

				if (llmClient) {
					const queryGen = createQueryGenerator({ llmClient });
					queries = await queryGen.generateForCodeUnits(codeUnits);
				} else {
					const queryGen = createQueryGenerator({
						llmClient: null as any,
					});
					queries = codeUnits.flatMap((u) => queryGen.generateSimpleQueries(u));
				}

				db.insertQueries(run.id, queries);
			}

			// Total: each query produces one result per model
			const totalItems = queries.length * numModels;
			let completed = 0;

			stateMachine.startPhase("evaluation:retrieval", totalItems);

			// Create evaluator and build COMBINED index with ALL models' summaries
			const evaluator = createRetrievalEvaluator({
				embeddingsClient,
				kValues: evalConfig.kValues,
			});

			stateMachine.updateProgress(
				"evaluation:retrieval",
				0,
				undefined,
				`Building combined index (${summaries.length} summaries from ${numModels} models)...`,
			);

			// Build ONE index with ALL summaries - models compete!
			// Pass progress callback for embedding visibility
			await evaluator.buildCombinedIndex(summariesByModel, (msg) => {
				stateMachine.updateProgress("evaluation:retrieval", 0, undefined, msg);
			});

			// Evaluate each query with cross-model competition
			for (const query of queries) {
				// Resume support: skip already-evaluated queries
				if (evaluatedRetrieval.has(query.id)) {
					completed += numModels;
					continue;
				}

				try {
					// This returns results for ALL models in one call
					const results = await evaluator.evaluateQueryCrossModel(
						query,
						summariesByModel,
					);

					for (const result of results) {
						db.insertEvaluationResult(run.id, result);
						completed++;
					}

					stateMachine.updateProgress(
						"evaluation:retrieval",
						completed,
						query.id,
						`Cross-model: ${completed}/${totalItems}`,
					);
				} catch (error) {
					// Skip query but count the models we would have evaluated
					completed += numModels;
				}
			}

			return {
				success: true,
				itemsProcessed: completed,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				itemsProcessed: 0,
				error: message,
			};
		}
	};
}
```


### `src/benchmark-v2/evaluators/contrastive/index.ts`
```typescript
/**
 * Contrastive Evaluator
 *
 * Evaluates summaries by testing if they can correctly identify
 * their source code from a set of distractors.
 *
 * Two methods:
 * 1. Embedding-based: Use vector similarity
 * 2. LLM-based: Ask an LLM to match summary to code
 */

import { randomUUID } from "crypto";
import type {
	ILLMClient,
	IEmbeddingsClient,
	LLMMessage,
} from "../../../types.js";
import type {
	BenchmarkCodeUnit,
	GeneratedSummary,
	EvaluationResult,
	ContrastiveResults,
	DistractorSet,
	DistractorDifficulty,
	EvaluatorContext,
} from "../../types.js";
import { BaseEvaluator } from "../base.js";
import {
	ContrastiveError,
	InsufficientDistractorsError,
} from "../../errors.js";
import type { PhaseContext, PhaseResult } from "../../pipeline/orchestrator.js";

// ============================================================================
// Prompts
// ============================================================================

const CONTRASTIVE_LLM_PROMPT = `Given a code summary, identify which code snippet it describes.

## Summary
{summary}

## Code Options
{code_options}

Which code option (1-{n}) does this summary describe?

Respond with ONLY a JSON object:
\`\`\`json
{
  "selected": <number 1-{n}>,
  "confidence": "high" | "medium" | "low",
  "reasoning": "<brief explanation>"
}
\`\`\``;

// ============================================================================
// Distractor Selection
// ============================================================================

/**
 * Select distractors for a target code unit
 */
export function selectDistractors(
	target: BenchmarkCodeUnit,
	allUnits: BenchmarkCodeUnit[],
	count: number = 9,
	embeddings?: Map<string, number[]>,
): DistractorSet {
	const distractors: BenchmarkCodeUnit[] = [];

	// Filter candidates (same language, same type, not target)
	const candidates = allUnits.filter(
		(u) =>
			u.id !== target.id &&
			u.language === target.language &&
			u.type === target.type,
	);

	if (candidates.length < count) {
		// Relax type constraint if not enough candidates
		const relaxedCandidates = allUnits.filter(
			(u) => u.id !== target.id && u.language === target.language,
		);

		if (relaxedCandidates.length < count) {
			throw new InsufficientDistractorsError(
				target.id,
				count,
				relaxedCandidates.length,
			);
		}

		// Use relaxed candidates
		distractors.push(...shuffleAndTake(relaxedCandidates, count));
	} else {
		// TIER 1: Same file (hardest - similar context)
		const sameFile = candidates.filter((c) => c.path === target.path);
		distractors.push(...shuffleAndTake(sameFile, Math.min(3, sameFile.length)));

		// TIER 2: Similar signature (hard - same interface)
		if (target.metadata.signature && distractors.length < count) {
			const similarSig = candidates.filter(
				(c) =>
					c.metadata.signature &&
					!distractors.some((d) => d.id === c.id) &&
					signatureSimilarity(
						c.metadata.signature,
						target.metadata.signature!,
					) > 0.7,
			);
			distractors.push(
				...shuffleAndTake(similarSig, Math.min(3, count - distractors.length)),
			);
		}

		// TIER 3: Semantic similarity (HARD) - use embeddings if available
		// Select code that is VERY similar to target (0.70-0.95 range)
		// These should be genuinely confusing alternatives that test summary specificity
		if (embeddings && distractors.length < count) {
			const targetEmb = embeddings.get(target.id);
			if (targetEmb) {
				const similarities = candidates
					.filter((c) => !distractors.some((d) => d.id === c.id))
					.map((c) => ({
						unit: c,
						similarity: cosineSimilarity(embeddings.get(c.id), targetEmb),
					}))
					.filter((s) => s.similarity !== null)
					// Sort by DESCENDING similarity to get the most confusing alternatives
					.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
					// Take top candidates that are similar but not duplicates (>0.95 might be copies)
					.filter((s) => s.similarity! < 0.95);

				// Prioritize MOST similar items - these are the hardest distractors
				distractors.push(
					...similarities
						.slice(0, count - distractors.length)
						.map((s) => s.unit),
				);
			}
		}

		// TIER 4: Random padding if needed
		if (distractors.length < count) {
			const remaining = candidates.filter(
				(c) => !distractors.some((d) => d.id === c.id),
			);
			distractors.push(
				...shuffleAndTake(remaining, count - distractors.length),
			);
		}
	}

	// Calculate difficulty
	const difficulty = calculateDifficulty(distractors, target);

	return {
		targetCodeUnitId: target.id,
		distractorIds: distractors.slice(0, count).map((d) => d.id),
		difficulty,
	};
}

function shuffleAndTake<T>(array: T[], count: number): T[] {
	const shuffled = [...array].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, count);
}

function signatureSimilarity(sig1: string, sig2: string): number {
	// Simple similarity based on parameter count and names
	const params1 = extractParamNames(sig1);
	const params2 = extractParamNames(sig2);

	if (params1.length === 0 && params2.length === 0) return 1;

	const countSim =
		1 -
		Math.abs(params1.length - params2.length) /
			Math.max(params1.length, params2.length, 1);

	// Check for common parameter names
	const common = params1.filter((p) => params2.includes(p)).length;
	const nameSim = common / Math.max(params1.length, params2.length, 1);

	return (countSim + nameSim) / 2;
}

function extractParamNames(signature: string): string[] {
	const match = signature.match(/\((.*?)\)/);
	if (!match) return [];

	return match[1]
		.split(",")
		.map((p) => p.trim().split(/[:\s]/)[0])
		.filter((p) => p.length > 0);
}

function cosineSimilarity(
	a: number[] | undefined,
	b: number[] | undefined,
): number | null {
	if (!a || !b || a.length !== b.length) return null;

	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom > 0 ? dot / denom : 0;
}

function calculateDifficulty(
	distractors: BenchmarkCodeUnit[],
	target: BenchmarkCodeUnit,
): DistractorDifficulty {
	// More same-file distractors = harder
	const sameFileCount = distractors.filter(
		(d) => d.path === target.path,
	).length;

	if (sameFileCount >= 3) return "hard";
	if (sameFileCount >= 1) return "medium";
	return "easy";
}

// ============================================================================
// Embedding-based Contrastive Evaluator
// ============================================================================

export class EmbeddingContrastiveEvaluator extends BaseEvaluator<EvaluationResult> {
	private embeddingsClient: IEmbeddingsClient;

	constructor(embeddingsClient: IEmbeddingsClient) {
		super();
		this.embeddingsClient = embeddingsClient;
	}

	async evaluate(
		summary: GeneratedSummary,
		codeUnit: BenchmarkCodeUnit,
		context: EvaluatorContext,
	): Promise<EvaluationResult> {
		const distractorSet = context.distractors?.find(
			(d) => d.targetCodeUnitId === codeUnit.id,
		);

		if (!distractorSet) {
			throw new ContrastiveError("No distractor set for code unit", {
				codeUnitId: codeUnit.id,
			});
		}

		const allUnits = context.allCodeUnits || [];
		const distractorUnits = distractorSet.distractorIds
			.map((id) => allUnits.find((u) => u.id === id))
			.filter((u): u is BenchmarkCodeUnit => u !== undefined);

		// Embed summary and all code candidates
		const candidates = [codeUnit, ...distractorUnits];
		const texts = [summary.summary, ...candidates.map((c) => c.content)];

		const embedResult = await this.embeddingsClient.embed(texts);
		const embeddings = embedResult.embeddings;

		const summaryEmb = embeddings[0];
		const codeEmbs = embeddings.slice(1);

		// Calculate similarities
		const similarities = codeEmbs.map((emb, idx) => ({
			unitId: candidates[idx].id,
			similarity: cosineSimilarity(summaryEmb, emb) || 0,
			isTarget: candidates[idx].id === codeUnit.id,
		}));

		// Sort by similarity (descending)
		similarities.sort((a, b) => b.similarity - a.similarity);

		// Find rank of target
		const targetRank = similarities.findIndex((s) => s.isTarget) + 1;

		const contrastiveResults: ContrastiveResults = {
			correct: targetRank === 1,
			predictedRank: targetRank,
			distractorIds: distractorSet.distractorIds,
			method: "embedding",
			confidenceGap: similarities[0].similarity - similarities[1].similarity,
			embeddingModel: this.embeddingsClient.getModel(),
		};

		return {
			id: randomUUID(),
			summaryId: summary.id,
			evaluationType: "contrastive",
			contrastiveResults,
			evaluatedAt: new Date().toISOString(),
		};
	}

	getType() {
		return "contrastive" as const;
	}
}

// ============================================================================
// LLM-based Contrastive Evaluator
// ============================================================================

interface ContrastiveLLMResponse {
	selected: number;
	confidence: "high" | "medium" | "low";
	reasoning: string;
}

export class LLMContrastiveEvaluator extends BaseEvaluator<EvaluationResult> {
	constructor(llmClient: ILLMClient) {
		super(llmClient);
	}

	async evaluate(
		summary: GeneratedSummary,
		codeUnit: BenchmarkCodeUnit,
		context: EvaluatorContext,
	): Promise<EvaluationResult> {
		if (!this.llmClient) {
			throw new ContrastiveError("No LLM client provided");
		}

		const distractorSet = context.distractors?.find(
			(d) => d.targetCodeUnitId === codeUnit.id,
		);

		if (!distractorSet) {
			throw new ContrastiveError("No distractor set for code unit", {
				codeUnitId: codeUnit.id,
			});
		}

		const allUnits = context.allCodeUnits || [];
		const distractorUnits = distractorSet.distractorIds
			.map((id) => allUnits.find((u) => u.id === id))
			.filter((u): u is BenchmarkCodeUnit => u !== undefined);

		// Randomize order of candidates
		const candidates = [codeUnit, ...distractorUnits].sort(
			() => Math.random() - 0.5,
		);
		const targetPosition =
			candidates.findIndex((c) => c.id === codeUnit.id) + 1;

		// Build code options string
		const codeOptions = candidates
			.map(
				(c, idx) =>
					`### Option ${idx + 1}\n\`\`\`${c.language}\n${this.truncateCode(c.content, 1500)}\n\`\`\``,
			)
			.join("\n\n");

		const prompt = CONTRASTIVE_LLM_PROMPT.replace("{summary}", summary.summary)
			.replace("{code_options}", codeOptions)
			.replace(/{n}/g, String(candidates.length));

		const messages: LLMMessage[] = [{ role: "user", content: prompt }];

		try {
			const response = await this.llmClient.complete(messages, {
				temperature: 0,
				maxTokens: 500,
			});

			const parsed = this.parseJSONResponse<ContrastiveLLMResponse>(
				response.content,
			);

			const correct = parsed.selected === targetPosition;

			const contrastiveResults: ContrastiveResults = {
				correct,
				predictedRank: correct ? 1 : 2, // Simplified - either got it or didn't
				distractorIds: distractorSet.distractorIds,
				method: "llm",
				llmModel: this.llmClient.getModel(),
			};

			return {
				id: randomUUID(),
				summaryId: summary.id,
				evaluationType: "contrastive",
				contrastiveResults,
				evaluatedAt: new Date().toISOString(),
			};
		} catch (error) {
			throw new ContrastiveError(
				error instanceof Error ? error.message : String(error),
				{ summaryId: summary.id, codeUnitId: codeUnit.id },
				error instanceof Error ? error : undefined,
			);
		}
	}

	getType() {
		return "contrastive" as const;
	}
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createEmbeddingContrastiveEvaluator(
	embeddingsClient: IEmbeddingsClient,
): EmbeddingContrastiveEvaluator {
	return new EmbeddingContrastiveEvaluator(embeddingsClient);
}

export function createLLMContrastiveEvaluator(
	llmClient: ILLMClient,
): LLMContrastiveEvaluator {
	return new LLMContrastiveEvaluator(llmClient);
}

// ============================================================================
// Phase Executor
// ============================================================================

/**
 * Create the contrastive evaluation phase executor
 */
export function createContrastivePhaseExecutor(
	llmClient?: ILLMClient,
	embeddingsClient?: IEmbeddingsClient,
): (context: PhaseContext) => Promise<PhaseResult> {
	return async (context: PhaseContext): Promise<PhaseResult> => {
		const { db, run, config, stateMachine } = context;
		const evalConfig = config.evaluation.contrastive;

		if (!evalConfig.enabled) {
			return {
				success: true,
				itemsProcessed: 0,
				skipReason: "disabled in config",
			};
		}

		try {
			// Get data
			const summaries = db.getSummaries(run.id);
			const codeUnits = db.getCodeUnits(run.id);

			// Resume support: get existing evaluation results
			const existingResults = db.getEvaluationResults(run.id, "contrastive");
			const evaluatedContrastive = new Set<string>(); // key: summaryId:method
			for (const result of existingResults) {
				if (result.contrastiveResults) {
					const key = `${result.summaryId}:${result.contrastiveResults.method}`;
					evaluatedContrastive.add(key);
				}
			}

			// Calculate methods to run
			const methods: ("embedding" | "llm")[] = [];
			if (evalConfig.method === "both") {
				if (embeddingsClient) methods.push("embedding");
				if (llmClient) methods.push("llm");
			} else if (evalConfig.method === "embedding" && embeddingsClient) {
				methods.push("embedding");
			} else if (evalConfig.method === "llm" && llmClient) {
				methods.push("llm");
			}

			if (methods.length === 0) {
				return {
					success: true,
					itemsProcessed: 0,
					skipReason: "no evaluation clients available",
				};
			}

			// Adaptive distractor count based on largest same-language group
			// Distractors must be same language, so we need enough units per language
			const languageCounts = new Map<string, number>();
			for (const unit of codeUnits) {
				languageCounts.set(
					unit.language,
					(languageCounts.get(unit.language) || 0) + 1,
				);
			}
			const maxLanguageCount = Math.max(...languageCounts.values());

			// Max possible distractors = largest language group - 1 (excluding target)
			const maxPossibleDistractors = maxLanguageCount - 1;
			const minDistractors = 4;
			let actualDistractorCount = Math.min(
				evalConfig.distractorCount,
				maxPossibleDistractors,
			);

			if (actualDistractorCount < minDistractors) {
				const langInfo = Array.from(languageCounts.entries())
					.map(([lang, count]) => `${lang}:${count}`)
					.join(", ");
				return {
					success: true,
					itemsProcessed: 0,
					skipReason: `largest language group has ${maxLanguageCount} units, need ${minDistractors + 1}+ (${langInfo})`,
				};
			}

			// Pre-compute code embeddings for semantic distractor selection
			// This enables TIER 3 (hard distractors) - finding code similar to target
			let codeEmbeddings: Map<string, number[]> | undefined;
			if (embeddingsClient) {
				try {
					// Show progress - this can be slow for large codebases
					stateMachine.startPhase("evaluation:contrastive", 0);
					stateMachine.updateProgress(
						"evaluation:contrastive",
						0,
						undefined,
						`Embedding ${codeUnits.length} code units for semantic distractors...`,
					);

					// Embed in batches for progress visibility
					const BATCH_SIZE = 50;
					const codeTexts = codeUnits.map((u) => u.content);
					const allEmbeddings: number[][] = [];

					for (let i = 0; i < codeTexts.length; i += BATCH_SIZE) {
						const batchEnd = Math.min(i + BATCH_SIZE, codeTexts.length);
						const batchTexts = codeTexts.slice(i, batchEnd);

						stateMachine.updateProgress(
							"evaluation:contrastive",
							0,
							undefined,
							`Embedding code ${batchEnd}/${codeUnits.length}...`,
						);
						const result = await embeddingsClient.embed(batchTexts);
						allEmbeddings.push(...result.embeddings);
					}

					codeEmbeddings = new Map();
					codeUnits.forEach((unit, idx) => {
						codeEmbeddings!.set(unit.id, allEmbeddings[idx]);
					});

					stateMachine.updateProgress(
						"evaluation:contrastive",
						0,
						undefined,
						"Generating distractor sets...",
					);
				} catch (error) {
					// Fall back to non-semantic distractor selection (silent)
				}
			}

			// Generate distractor sets FIRST (before starting phase)
			const distractorSets: DistractorSet[] = [];
			for (const codeUnit of codeUnits) {
				try {
					const set = selectDistractors(
						codeUnit,
						codeUnits,
						actualDistractorCount,
						codeEmbeddings, // Pass embeddings for TIER 3 selection
					);
					distractorSets.push(set);
				} catch (error) {
					// Skip units without enough distractors (different language/type)
					continue;
				}
			}

			// If no distractor sets could be generated, skip evaluation
			if (distractorSets.length === 0) {
				const langInfo = Array.from(languageCounts.entries())
					.map(([lang, count]) => `${lang}:${count}`)
					.join(", ");
				return {
					success: true,
					itemsProcessed: 0,
					skipReason: `no language has ${actualDistractorCount + 1}+ code units (${langInfo})`,
				};
			}

			// Get code unit IDs that have valid distractor sets
			const validCodeUnitIds = new Set(
				distractorSets.map((ds) => ds.targetCodeUnitId),
			);

			// Filter summaries to only those with valid distractor sets
			const validSummaries = summaries.filter((s) =>
				validCodeUnitIds.has(s.codeUnitId),
			);

			// Only start phase after we know we have work to do
			const totalItems = validSummaries.length * methods.length;
			stateMachine.startPhase("evaluation:contrastive", totalItems);

			// Save distractor sets
			db.insertDistractorSets(run.id, distractorSets);

			const concurrency = 30; // Process 30 summaries concurrently
			const REQUEST_TIMEOUT_MS = 60_000; // 60 second timeout per request

			// Timeout wrapper
			const withTimeout = <T>(
				promise: Promise<T>,
				timeoutMs: number,
			): Promise<T> => {
				return Promise.race([
					promise,
					new Promise<T>((_, reject) =>
						setTimeout(
							() => reject(new Error(`Request timeout after ${timeoutMs}ms`)),
							timeoutMs,
						),
					),
				]);
			};

			// Build code unit map for faster lookups
			const codeUnitMap = new Map(codeUnits.map((u) => [u.id, u]));

			// Run methods in parallel
			const methodPromises = methods.map(async (method) => {
				const evaluator =
					method === "embedding"
						? createEmbeddingContrastiveEvaluator(embeddingsClient!)
						: createLLMContrastiveEvaluator(llmClient!);

				let methodCompleted = 0;
				const inProgress = new Set<string>();

				const processSummary = async (
					summary: (typeof validSummaries)[0],
				): Promise<void> => {
					const codeUnit = codeUnitMap.get(summary.codeUnitId);
					if (!codeUnit) return;

					// Resume support: skip already evaluated
					const evalKey = `${summary.id}:${method}`;
					if (evaluatedContrastive.has(evalKey)) {
						methodCompleted++;
						return;
					}

					inProgress.add(summary.id);

					try {
						const result = await withTimeout(
							evaluator.evaluate(summary, codeUnit, {
								allCodeUnits: codeUnits,
								distractors: distractorSets,
							}),
							REQUEST_TIMEOUT_MS,
						);
						db.insertEvaluationResult(run.id, result);
					} catch (error) {
						// Skip silently to not disrupt progress bar
					}

					inProgress.delete(summary.id);
					methodCompleted++;

					stateMachine.updateProgress(
						"evaluation:contrastive",
						methodCompleted,
						summary.id,
						`${method}: ${methodCompleted}/${validSummaries.length}/${inProgress.size}`,
					);
				};

				// Initial progress
				stateMachine.updateProgress(
					"evaluation:contrastive",
					0,
					undefined,
					`${method}: 0/${validSummaries.length}/0`,
				);

				// Process in concurrent batches with allSettled (don't block on failures)
				for (let i = 0; i < validSummaries.length; i += concurrency) {
					const batch = validSummaries.slice(i, i + concurrency);
					await Promise.allSettled(batch.map(processSummary));
				}

				return methodCompleted;
			});

			const results = await Promise.all(methodPromises);
			const completed = results.reduce((sum, count) => sum + count, 0);

			return {
				success: true,
				itemsProcessed: completed,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				itemsProcessed: 0,
				error: message,
			};
		}
	};
}
```


### `src/benchmark-v2/types.ts`
```typescript
/**
 * Benchmark V2 Types
 *
 * Complete type definitions for the LLM code summary evaluation benchmark.
 * Implements the 4-phase evaluation pipeline:
 *   Phase 1: Extraction (code units from codebase)
 *   Phase 2: Generation (summaries from each model)
 *   Phase 3: Evaluation (Judge, Contrastive, Retrieval, Downstream)
 *   Phase 4: Aggregation & Reporting
 */

import type { CodeChunk, LLMProvider } from "../types.js";

// ============================================================================
// Code Unit Types (Phase 1: Extraction)
// ============================================================================

/** Types of code units that can be benchmarked */
export type CodeUnitType = "function" | "class" | "method" | "file" | "module";

/** Parameter definition from AST */
export interface Parameter {
	name: string;
	type?: string;
	description?: string;
	optional: boolean;
	defaultValue?: string;
}

/** AST-derived metadata for a code unit */
export interface CodeUnitMetadata {
	startLine: number;
	endLine: number;
	signature?: string;
	parameters?: Parameter[];
	returnType?: string;
	visibility?: "public" | "private" | "protected";
	decorators?: string[];
	dependencies: string[];
	exports?: string[];
	complexity?: number;
	isAsync?: boolean;
}

/** Relationships extracted from AST */
export interface CodeUnitRelationships {
	parentId?: string;
	childIds: string[];
	callsIds: string[];
	calledByIds: string[];
}

/**
 * A code unit represents a single extractable piece of code
 * (function, class, method, or file) that will be summarized.
 *
 * Note: We extend CodeChunk from the main codebase where applicable,
 * but add benchmark-specific fields for full spec compliance.
 */
export interface BenchmarkCodeUnit {
	/** Unique identifier (hash of content + path) */
	id: string;
	/** File path relative to repo root */
	path: string;
	/** Function/class/file name */
	name: string;
	/** Type of code unit */
	type: CodeUnitType;
	/** Programming language */
	language: string;
	/** The actual code content */
	content: string;
	/** AST-derived metadata */
	metadata: CodeUnitMetadata;
	/** Relationships from AST */
	relationships: CodeUnitRelationships;
	/** Original CodeChunk reference (for reusing existing infrastructure) */
	sourceChunk?: CodeChunk;
}

// ============================================================================
// Generated Summary Types (Phase 2: Generation)
// ============================================================================

/** Metadata about how a summary was generated */
export interface GenerationMetadata {
	modelName: string;
	modelVersion: string;
	promptVersion: string;
	temperature: number;
	maxTokens: number;
	generatedAt: string;
	latencyMs: number;
	inputTokens: number;
	outputTokens: number;
	cost?: number;
}

/** A summary generated by an LLM for a code unit */
export interface GeneratedSummary {
	/** Unique identifier */
	id: string;
	/** Reference to the code unit */
	codeUnitId: string;
	/** Which model generated this */
	modelId: string;
	/** The generated summary text */
	summary: string;
	/** Generation metadata */
	generationMetadata: GenerationMetadata;
}

// ============================================================================
// Evaluation Result Types (Phase 3: Evaluation)
// ============================================================================

/** Types of evaluations supported */
export type EvaluationType =
	| "judge"
	| "contrastive"
	| "retrieval"
	| "downstream"
	| "self"
	| "iterative";

/** Scores from judge evaluation (1-5 scale) */
export interface JudgeScores {
	accuracy: number;
	completeness: number;
	semanticRichness: number;
	abstraction: number;
	conciseness: number;
}

/** Results from LLM-as-Judge evaluation */
export interface JudgeResults {
	judgeModelId: string;
	scores: JudgeScores;
	reasoning: string;
	weightedAverage: number;
	pairwiseWins?: number;
	pairwiseLosses?: number;
	pairwiseTies?: number;
	/** Cost of this judge evaluation in USD */
	cost?: number;
}

/** Method used for contrastive matching */
export type ContrastiveMethod = "embedding" | "llm";

/** Results from contrastive matching evaluation */
export interface ContrastiveResults {
	correct: boolean;
	predictedRank: number;
	distractorIds: string[];
	method: ContrastiveMethod;
	confidenceGap?: number;
	embeddingModel?: string;
	llmModel?: string;
}

/** Results from retrieval evaluation */
export interface RetrievalResults {
	queryId: string;
	queryType: string;
	query: string;
	hitAtK: Record<number, boolean>;
	reciprocalRank: number;
	retrievedRank: number | null;
	// Cross-model competition fields (optional for backward compatibility)
	/** Rank among models (1 = this model's summary ranked highest) */
	modelRank?: number;
	/** Total number of models competing */
	totalModels?: number;
	/** Did this model win (rank #1 among models)? */
	isWinner?: boolean;
	/** Total items in the combined index */
	poolSize?: number;
}

/** Downstream task types */
export type DownstreamTaskType =
	| "completion"
	| "bug_localization"
	| "function_selection";

/** Results from downstream task evaluation */
export interface DownstreamResults {
	taskType: DownstreamTaskType;
	taskId: string;
	success: boolean;
	partialScore?: number;
	bleuScore?: number;
	details?: Record<string, unknown>;
}

/** Self-evaluation task types */
export type SelfEvalTaskType =
	| "retrieval"
	| "completion"
	| "function_selection";

/** Results from self-evaluation (model uses its own summaries) */
export interface SelfEvaluationResults {
	/** The generating model that was tested */
	generatingModelId: string;
	/** Type of self-evaluation task */
	taskType: SelfEvalTaskType;
	/** For retrieval: did the model find the right code using its own summary? */
	retrievalResults?: {
		queryId: string;
		query: string;
		/** Did the model correctly identify the source code from its summary? */
		correct: boolean;
		/** Confidence score (0-1) from the model */
		confidence: number;
		/** Model's reasoning for its choice */
		reasoning?: string;
	};
	/** For completion: could the model complete code using its own summary? */
	completionResults?: {
		taskId: string;
		/** BLEU score of completion */
		bleuScore: number;
		/** Did it pass tests? */
		passedTests: boolean;
		/** Model's generated completion */
		completion: string;
	};
	/** For function selection: could the model pick the right function using its summary? */
	functionSelectionResults?: {
		taskId: string;
		/** Did it select the correct function? */
		correct: boolean;
		/** Which function was selected */
		selectedFunction: string;
		/** Model's reasoning */
		reasoning?: string;
	};
}

/** Results from iterative refinement evaluation */
export interface IterativeResults {
	/** The model that generated the summary */
	modelId: string;
	/** Code unit this summary is for */
	codeUnitId: string;
	/** Number of refinement rounds executed (0 = initial was good) */
	rounds: number;
	/** Whether target rank was achieved */
	success: boolean;
	/** Initial summary quality rank */
	initialRank: number | null;
	/** Final summary quality rank */
	finalRank: number | null;
	/** Brokk-style score: 1.0 / log2(rounds + 2) */
	refinementScore: number;
	/** History of all refinement attempts */
	history: Array<{
		round: number;
		rank: number | null;
		passed: boolean;
		summary?: string;
	}>;
	/** Strategy used for quality testing */
	strategyName: string;
	/** The final refined summary (if different from original) */
	refinedSummary?: string;
	/** Total time spent on refinement */
	durationMs: number;
}

/** Complete evaluation result for a summary */
export interface EvaluationResult {
	id: string;
	summaryId: string;
	evaluationType: EvaluationType;
	judgeResults?: JudgeResults;
	contrastiveResults?: ContrastiveResults;
	retrievalResults?: RetrievalResults;
	downstreamResults?: DownstreamResults;
	selfEvaluationResults?: SelfEvaluationResults;
	iterativeResults?: IterativeResults;
	evaluatedAt: string;
}

// ============================================================================
// Pairwise Comparison Types (for Judge Evaluation)
// ============================================================================

/** Result of a pairwise comparison between two summaries */
export interface PairwiseResult {
	modelA: string;
	modelB: string;
	codeUnitId: string;
	judgeModel: string;
	winner: "A" | "B" | "tie";
	confidence: "high" | "medium" | "low";
	positionSwapped: boolean;
	reasoning?: string;
	criteriaBreakdown?: {
		accuracy: "A" | "B" | "tie";
		completeness: "A" | "B" | "tie";
		searchability: "A" | "B" | "tie";
		clarity: "A" | "B" | "tie";
		conciseness: "A" | "B" | "tie";
	};
	/** Cost of this comparison in USD (may be portion of batched call) */
	cost?: number;
}

/** Tournament scores for a model */
export interface TournamentScore {
	wins: number;
	losses: number;
	ties: number;
	winRate: number;
	btScore: number; // Bradley-Terry score
}

// ============================================================================
// Query Types (for Retrieval Evaluation)
// ============================================================================

/** Types of search queries for retrieval testing */
export type QueryType =
	| "vague"
	| "wrong_terminology"
	| "specific_behavior"
	| "integration"
	| "problem_based"
	// Doc-style queries (test documentation search patterns)
	| "doc_conceptual" // "What is X?", "How does X work?"
	| "doc_api_lookup" // "X API", "X parameters", "X return type"
	| "doc_best_practice"; // "best way to X", "recommended pattern for X"

/** A generated search query for testing retrieval */
export interface GeneratedQuery {
	id: string;
	codeUnitId: string;
	type: QueryType;
	query: string;
	shouldFind: boolean;
}

// ============================================================================
// Downstream Task Types
// ============================================================================

/** Code completion task */
export interface CompletionTask {
	id: string;
	codeUnitId: string;
	partialCode: string;
	fullCode: string;
	requirements: string;
	language: string;
	relevantSummaryIds: string[];
	testCases?: Array<{
		input: string;
		expectedOutput: string;
	}>;
}

/** Bug localization task */
export interface BugLocalizationTask {
	id: string;
	bugDescription: string;
	actualBuggyFile: string;
	candidateFiles: string[];
}

/** Function selection task */
export interface FunctionSelectionTask {
	id: string;
	taskDescription: string;
	correctFunction: string;
	candidateFunctions: string[];
}

// ============================================================================
// Distractor Types (for Contrastive Evaluation)
// ============================================================================

/** Difficulty level for distractor sets */
export type DistractorDifficulty = "easy" | "medium" | "hard";

/** Set of distractors for a target code unit */
export interface DistractorSet {
	targetCodeUnitId: string;
	distractorIds: string[];
	difficulty: DistractorDifficulty;
}

// ============================================================================
// Scoring Types (Phase 4: Aggregation)
// ============================================================================

/** Default weights for combining judge scores */
export const JUDGE_SCORE_WEIGHTS = {
	accuracy: 0.25,
	completeness: 0.2,
	semanticRichness: 0.25,
	abstraction: 0.15,
	conciseness: 0.15,
} as const;

/**
 * Weights for combining quality evaluation metrics.
 *
 * These metrics measure how well summaries serve LLM agents:
 * - Retrieval: Can agents FIND the right code? (semantic search)
 * - Contrastive: Can agents DISTINGUISH similar code?
 * - Judge: Is the summary accurate and complete?
 *
 * Operational metrics (latency, cost, refinement, self-eval) are
 * reported separately and don't affect the quality score.
 */
export interface EvaluationWeights {
	/** Retrieval quality (P@K, MRR) - most critical for code search */
	retrieval: number;
	/** Contrastive accuracy - distinguishes code among distractors */
	contrastive: number;
	/** Judge score - accuracy, completeness, quality */
	judge: number;
	/** @deprecated Use operational metrics instead */
	downstream?: number;
	/** @deprecated Use operational metrics instead */
	iterative?: number;
}

/**
 * Default evaluation weights optimized for LLM agent code understanding.
 *
 * Rationale:
 * - Retrieval (45%): If agents can't find code, nothing else matters
 * - Contrastive (30%): Agents must distinguish similar functions
 * - Judge (25%): Quality baseline for accuracy/completeness
 */
export const DEFAULT_EVALUATION_WEIGHTS: EvaluationWeights = {
	retrieval: 0.45,
	contrastive: 0.3,
	judge: 0.25,
};

/** Weights for combining judge evaluation methods */
export interface JudgeWeights {
	pointwise: number;
	pairwise: number;
}

/** Weights for combining contrastive methods */
export interface ContrastiveWeights {
	embedding: number;
	llm: number;
}

/** Weights for combining retrieval metrics */
export interface RetrievalWeights {
	precision1: number;
	precision5: number;
	mrr: number;
}

/** Weights for combining downstream tasks */
export interface DownstreamWeights {
	completion: number;
	bugLocalization: number;
	functionSelection: number;
}

/** Complete scoring configuration */
export interface ScoringConfig {
	judgeWeights: JudgeWeights;
	contrastiveWeights: ContrastiveWeights;
	retrievalWeights: RetrievalWeights;
	downstreamWeights: DownstreamWeights;
	evalWeights: EvaluationWeights;
}

/** Default scoring configuration */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
	judgeWeights: {
		pointwise: 0.4,
		pairwise: 0.6,
	},
	contrastiveWeights: {
		embedding: 0.5,
		llm: 0.5,
	},
	retrievalWeights: {
		precision1: 0.3,
		precision5: 0.4,
		mrr: 0.3,
	},
	downstreamWeights: {
		completion: 0.4,
		bugLocalization: 0.3,
		functionSelection: 0.3,
	},
	evalWeights: DEFAULT_EVALUATION_WEIGHTS,
};

/** Normalized scores for a model (all 0-1 scale) */
export interface NormalizedScores {
	modelId: string;
	judge: {
		pointwise: number;
		pairwise: number;
		combined: number;
	};
	contrastive: {
		embedding: number;
		llm: number;
		combined: number;
	};
	retrieval: {
		precision1: number;
		precision5: number;
		mrr: number;
		winRate?: number;
		combined: number;
	};
	downstream: {
		completion: number;
		bugLocalization: number;
		functionSelection: number;
		combined: number;
	};
	overall: number;
	/** Operational: Iterative refinement metrics (optional) */
	iterative?: {
		avgRounds: number;
		successRate: number;
		avgRefinementScore: number;
	};
	/** Operational: Self-evaluation metrics (optional) */
	self?: {
		overall: number;
		retrieval: number;
		functionSelection: number;
	};
}

// ============================================================================
// Model Configuration Types
// ============================================================================

/** Supported model providers */
export type ModelProvider =
	| "anthropic"
	| "openai"
	| "google"
	| "openrouter"
	| "meta"
	| "mistral"
	| "local"
	| "unknown";

/** Configuration for a model under test */
export interface ModelConfig {
	id: string;
	provider: ModelProvider;
	modelName: string;
	displayName?: string;
	apiEndpoint?: string;
	temperature: number;
	maxTokens: number;
}

// ============================================================================
// Benchmark Configuration Types
// ============================================================================

/** Sampling strategies for selecting code units */
export type SamplingStrategy = "random" | "stratified" | "all";

/** Evaluation configuration */
export interface EvaluationConfig {
	judge: {
		enabled: boolean;
		judgeModels: string[];
		usePairwise: boolean;
	};
	contrastive: {
		enabled: boolean;
		distractorCount: number;
		method: "embedding" | "llm" | "both";
		embeddingModel?: string;
	};
	retrieval: {
		enabled: boolean;
		queriesPerUnit: number;
		kValues: number[];
		embeddingModel?: string;
	};
	downstream: {
		enabled: boolean;
		tasks: {
			codeCompletion: boolean;
			bugLocalization: boolean;
			functionSelection: boolean;
		};
		completionModel?: string;
	};
	/** Self-evaluation: generating model tests its own summaries */
	self: {
		enabled: boolean;
		/** Tasks to run: retrieval (can model find code from its summary?), completion, function_selection */
		tasks: SelfEvalTaskType[];
		/** Number of retrieval queries per code unit */
		queriesPerUnit: number;
	};
	/** Iterative refinement: refine summaries until they rank well */
	iterative: {
		enabled: boolean;
		/** Maximum refinement rounds per summary (default: 3) */
		maxRounds: number;
		/** Target rank for success (e.g., 3 = top-3) */
		targetRank: number;
		/** Strategy for quality testing */
		strategy: "retrieval" | "bleu" | "llm-judge";
		/** Apply Brokk-style scoring penalty based on rounds */
		applyRoundsPenalty: boolean;
		/** Max items to refine per model (default: 10, refinement is expensive) */
		sampleSize: number;
	};
}

/** Complete benchmark configuration */
export interface BenchmarkConfig {
	/** Name of this benchmark run */
	name: string;
	/** Description of what's being tested */
	description?: string;
	/** Path to the project to benchmark */
	projectPath: string;
	/** Generator models to test */
	generators: ModelConfig[];
	/** Judge models (user-selected) */
	judges: string[];
	/** Number of code units to test */
	sampleSize: number;
	/** How to sample code units */
	samplingStrategy: SamplingStrategy;
	/** Types of code units to include */
	codeUnitTypes: CodeUnitType[];
	/** Languages to include */
	languages?: string[];
	/** Evaluation configuration */
	evaluation: EvaluationConfig;
	/** Scoring weights */
	weights: ScoringConfig;
	/** Output formats to generate */
	outputFormats: ReportFormat[];
	/** Enable verbose logging */
	verbose?: boolean;
	/**
	 * Local model parallelism (lmstudio, ollama).
	 * - 0 = all in parallel (may cause model swapping if VRAM limited)
	 * - 1 = sequential (default, safest for limited VRAM)
	 * - 2-4 = run N local models concurrently
	 */
	localModelParallelism?: number;
	/**
	 * Large model threshold in billions of parameters.
	 * Models >= this size run alone regardless of localModelParallelism.
	 * Default: 20 (20B+ models run isolated)
	 * Set to 0 to disable size-based isolation.
	 */
	largeModelThreshold?: number;
}

// ============================================================================
// Benchmark Run Types
// ============================================================================

/** Status of a benchmark run */
export type BenchmarkStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "paused";

/** Phase of the benchmark pipeline */
export type BenchmarkPhase =
	| "extraction"
	| "generation"
	| "evaluation:iterative"
	| "evaluation:judge"
	| "evaluation:contrastive"
	| "evaluation:retrieval"
	| "evaluation:downstream"
	| "evaluation:self"
	| "aggregation"
	| "reporting";

/** Information about the codebase being benchmarked */
export interface CodebaseInfo {
	name: string;
	repository?: string;
	commit?: string;
	languages: string[];
	totalCodeUnits: number;
	sampledCodeUnits: number;
}

/** A complete benchmark run */
export interface BenchmarkRun {
	id: string;
	name: string;
	description?: string;
	config: BenchmarkConfig;
	codebaseInfo: CodebaseInfo;
	modelsUnderTest: ModelConfig[];
	judgeModels: ModelConfig[];
	status: BenchmarkStatus;
	currentPhase?: BenchmarkPhase;
	startedAt: string;
	completedAt?: string;
	pausedAt?: string;
	error?: string;
}

// ============================================================================
// Reporting Types (Phase 4: Reporting)
// ============================================================================

/** Output format for reports */
export type ReportFormat = "json" | "markdown" | "html";

/** Model ranking entry */
export interface ModelRanking {
	rank: number;
	modelId: string;
	modelName: string;
	overallScore: number;
	scores: {
		judge: number;
		contrastive: number;
		retrieval: number;
		downstream: number;
	};
	deltaFromBaseline?: number;
}

/** Head-to-head model comparison */
export interface ModelComparison {
	modelA: string;
	modelB: string;
	winner: string;
	scoreDifference: number;
	significant: boolean;
	pValue?: number;
	pairwiseRecord: {
		aWins: number;
		bWins: number;
		ties: number;
	};
	strengthsA: string[];
	strengthsB: string[];
}

/** Failure analysis for a model */
export interface FailureAnalysis {
	modelId: string;
	weakestMetric: string;
	weakestLanguage: string;
	weakestCodeType: string;
	examples: Array<{
		codeUnitId: string;
		summary: string;
		issue: string;
		category: string;
	}>;
}

/** Cost breakdown by model */
export interface CostBreakdown {
	modelId: string;
	totalCost: number;
	costPerThousandSummaries: number;
	inputTokens: number;
	outputTokens: number;
}

/** Statistical significance test result */
export interface SignificanceTest {
	modelA: string;
	modelB: string;
	metric: string;
	meanDifference: number;
	pValue: number;
	significant: boolean;
	confidenceInterval: [number, number];
}

/** Complete benchmark report */
export interface BenchmarkReport {
	metadata: {
		benchmarkId: string;
		name: string;
		runDate: string;
		duration: string;
		codebase: CodebaseInfo;
		configuration: BenchmarkConfig;
	};
	rankings: ModelRanking[];
	detailed: {
		byModel: Map<string, NormalizedScores>;
		byLanguage: Map<string, Map<string, number>>;
		byCodeType: Map<string, Map<string, number>>;
	};
	comparisons: ModelComparison[];
	statistics: {
		significanceTests: SignificanceTest[];
	};
	failures: {
		byModel: Map<string, FailureAnalysis>;
		commonPatterns: Array<{
			pattern: string;
			frequency: number;
			description: string;
		}>;
	};
	costs: {
		byModel: Map<string, CostBreakdown>;
		total: number;
	};
}

// ============================================================================
// Progress Callback Types
// ============================================================================

/** Progress callback for benchmark operations */
export type BenchmarkProgressCallback = (
	phase: BenchmarkPhase,
	completed: number,
	total: number,
	details?: string,
) => void;

// ============================================================================
// Interface Definitions (for implementers)
// ============================================================================

/** Summary generator interface */
export interface ISummaryGenerator {
	/** Generate a summary for a code unit */
	generateSummary(
		codeUnit: BenchmarkCodeUnit,
		promptVersion: string,
	): Promise<GeneratedSummary>;
	/** Get model info */
	getModelInfo(): ModelConfig;
	/** Get accumulated usage stats */
	getUsageStats(): {
		inputTokens: number;
		outputTokens: number;
		cost: number;
		calls: number;
	};
	/** Reset usage tracking */
	resetUsage(): void;
}

/** Evaluator interface (for each evaluation type) */
export interface IEvaluator<TResult> {
	/** Run evaluation on a summary */
	evaluate(
		summary: GeneratedSummary,
		codeUnit: BenchmarkCodeUnit,
		context: EvaluatorContext,
	): Promise<TResult>;
	/** Get evaluation type */
	getType(): EvaluationType;
}

/** Context passed to evaluators */
export interface EvaluatorContext {
	/** All code units (for contrastive/retrieval) */
	allCodeUnits?: BenchmarkCodeUnit[];
	/** All summaries by model (for comparisons) */
	allSummaries?: Map<string, GeneratedSummary[]>;
	/** Generated queries (for retrieval) */
	queries?: GeneratedQuery[];
	/** Distractor sets (for contrastive) */
	distractors?: DistractorSet[];
	/** Downstream tasks */
	tasks?: {
		completion?: CompletionTask[];
		bugLocalization?: BugLocalizationTask[];
		functionSelection?: FunctionSelectionTask[];
	};
}

/** Reporter interface */
export interface IReporter {
	/** Generate report from benchmark results */
	generate(report: BenchmarkReport): Promise<string>;
	/** Get the format this reporter produces */
	getFormat(): ReportFormat;
}

// ============================================================================
// Database Schema Types (for SQLite persistence)
// ============================================================================

/** Database row types for SQLite persistence */
export interface DBBenchmarkRun {
	id: string;
	name: string;
	description: string | null;
	config_json: string;
	codebase_info_json: string;
	status: BenchmarkStatus;
	current_phase: BenchmarkPhase | null;
	started_at: string;
	completed_at: string | null;
	paused_at: string | null;
	error: string | null;
}

export interface DBCodeUnit {
	id: string;
	run_id: string;
	path: string;
	name: string;
	type: CodeUnitType;
	language: string;
	content: string;
	metadata_json: string;
	relationships_json: string;
}

export interface DBGeneratedSummary {
	id: string;
	run_id: string;
	code_unit_id: string;
	model_id: string;
	summary: string;
	generation_metadata_json: string;
}

export interface DBEvaluationResult {
	id: string;
	run_id: string;
	summary_id: string;
	evaluation_type: EvaluationType;
	results_json: string;
	evaluated_at: string;
}

export interface DBPairwiseResult {
	id: string;
	run_id: string;
	model_a: string;
	model_b: string;
	code_unit_id: string;
	judge_model: string;
	winner: "A" | "B" | "tie";
	confidence: string;
	position_swapped: boolean;
	reasoning: string | null;
	criteria_breakdown_json: string | null;
	cost: number | null;
}

export interface DBGeneratedQuery {
	id: string;
	run_id: string;
	code_unit_id: string;
	type: QueryType;
	query: string;
	should_find: boolean;
}

// ============================================================================
// Additional Types for Scorers and Reporters
// ============================================================================

/** Aggregated score for a model (used in reports) */
export interface AggregatedScore {
	modelId: string;
	judgeScore: number;
	contrastiveAccuracy: number;
	retrievalMRR: number;
	retrievalPrecision: Record<number, number>;
	downstreamScore: number;
	overallScore: number;
	rank: number;
}

/** Model-level score summary */
export interface ModelScore {
	modelId: string;
	scores: NormalizedScores;
	rank: number;
}

// ============================================================================
// Extended Config Types (used by index.ts)
// ============================================================================

/** Sampling configuration */
export interface SamplingConfig {
	strategy: SamplingStrategy;
	targetCount: number;
	maxPerFile?: number;
	minComplexity?: number;
}

/** Judge evaluation configuration */
export interface JudgeEvaluationConfig {
	enabled: boolean;
	judgeModels: string[];
	usePairwise: boolean;
	criteriaWeights?: {
		accuracy: number;
		completeness: number;
		semanticRichness: number;
		abstraction: number;
		conciseness: number;
	};
}

/** Contrastive evaluation configuration */
export interface ContrastiveEvaluationConfig {
	enabled: boolean;
	method: "embedding" | "llm" | "both";
	distractorCount: number;
	embeddingModel?: string;
}

/** Retrieval evaluation configuration */
export interface RetrievalEvaluationConfig {
	enabled: boolean;
	kValues: number[];
	queryTypes?: QueryType[];
}

/** Downstream evaluation configuration */
export interface DownstreamEvaluationConfig {
	enabled: boolean;
	tasks: {
		codeCompletion: boolean;
		bugLocalization: boolean;
		functionSelection: boolean;
	};
}

/** Extended scoring config with weights */
export interface ExtendedScoringConfig {
	weights: EvaluationWeights;
	normalization: "min-max" | "z-score" | "percentile";
}
```


### `src/core/embeddings.ts`
```typescript
/**
 * Embeddings Client
 *
 * Multi-provider embedding generation supporting:
 * - OpenRouter (cloud API)
 * - Voyage AI (cloud API for code/legal/finance)
 * - Ollama (local)
 * - Custom endpoints (local HTTP servers)
 */

import {
	DEFAULT_EMBEDDING_MODEL,
	OPENROUTER_EMBEDDINGS_URL,
	OPENROUTER_HEADERS,
	VOYAGE_EMBEDDINGS_URL,
	getApiKey,
	getVoyageApiKey,
	loadGlobalConfig,
} from "../config.js";
import type {
	EmbeddingProgressCallback,
	EmbeddingProvider,
	EmbeddingResponse,
	EmbedResult,
	IEmbeddingsClient,
} from "../types.js";

/** Local embedding providers (no network API call to cloud) */
const LOCAL_EMBEDDING_PROVIDERS: Set<EmbeddingProvider> = new Set([
	"ollama",
	"lmstudio",
	"local",
]);

// ============================================================================
// Constants
// ============================================================================

/** Maximum texts per batch request (OpenRouter) - smaller = more granular progress */
const MAX_BATCH_SIZE = 20;

/** Maximum retries for failed requests */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const BASE_RETRY_DELAY = 1000;

/** Default embedding model per provider */
const DEFAULT_MODELS: Record<EmbeddingProvider, string> = {
	openrouter: "qwen/qwen3-embedding-8b",
	ollama: "nomic-embed-text",
	lmstudio: "text-embedding-nomic-embed-text-v1.5",
	local: "all-minilm-l6-v2",
	voyage: "voyage-code-3",
};

/** Default endpoints */
const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";
const DEFAULT_LOCAL_ENDPOINT = "http://localhost:8000";

/** Known context lengths (in tokens) for common models */
const MODEL_CONTEXT_LENGTHS: Record<string, number> = {
	// Voyage models - 32K context
	"voyage-code-3": 32000,
	"voyage-3-large": 32000,
	"voyage-3.5": 32000,
	"voyage-3.5-lite": 32000,
	"voyage-finance-2": 32000,
	"voyage-law-2": 16000,
	"voyage-code-2": 16000,
	// OpenAI via OpenRouter - 8K context
	"openai/text-embedding-3-small": 8191,
	"openai/text-embedding-3-large": 8191,
	"text-embedding-3-small": 8191,
	"text-embedding-3-large": 8191,
	// Mistral
	"mistralai/mistral-embed-2312": 8192,
	// Google
	"google/gemini-embedding-001": 2048,
	// Sentence Transformers - small context
	"sentence-transformers/all-minilm-l6-v2": 512,
	"all-minilm-l6-v2": 512,
	// Ollama models
	"nomic-embed-text": 8192,
	"mxbai-embed-large": 512,
	"snowflake-arctic-embed": 512,
	"snowflake-arctic-embed2": 8192,
	"bge-m3": 8192,
	"bge-large": 512,
	embeddinggemma: 2048,
};

// ============================================================================
// Types
// ============================================================================

interface OpenRouterEmbeddingResponse {
	data: Array<{
		embedding: number[];
		index: number;
	}>;
	model: string;
	usage?: {
		prompt_tokens: number;
		total_tokens: number;
		/** Cost in USD (OpenRouter provides this directly) */
		cost?: number;
	};
}

interface OllamaEmbeddingResponse {
	embedding: number[];
}

export interface EmbeddingsClientOptions {
	/** Embedding provider */
	provider?: EmbeddingProvider;
	/** Model to use for embeddings */
	model?: string;
	/** API key (for OpenRouter) */
	apiKey?: string;
	/** Endpoint URL (for Ollama/local) */
	endpoint?: string;
	/** Request timeout in ms */
	timeout?: number;
}

// ============================================================================
// Base Client Class
// ============================================================================

abstract class BaseEmbeddingsClient implements IEmbeddingsClient {
	protected model: string;
	protected timeout: number;
	protected dimension?: number;
	protected provider: EmbeddingProvider;

	constructor(model: string, provider: EmbeddingProvider, timeout = 60000) {
		this.model = model;
		this.provider = provider;
		this.timeout = timeout;
	}

	getModel(): string {
		return this.model;
	}

	getDimension(): number | undefined {
		return this.dimension;
	}

	getProvider(): EmbeddingProvider {
		return this.provider;
	}

	isLocal(): boolean {
		return LOCAL_EMBEDDING_PROVIDERS.has(this.provider);
	}

	abstract embed(
		texts: string[],
		onProgress?: EmbeddingProgressCallback,
	): Promise<EmbedResult>;

	async embedOne(text: string): Promise<number[]> {
		const result = await this.embed([text]);
		return result.embeddings[0];
	}

	protected sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// ============================================================================
// OpenRouter Client
// ============================================================================

export class OpenRouterEmbeddingsClient extends BaseEmbeddingsClient {
	private apiKey: string;

	constructor(options: EmbeddingsClientOptions = {}) {
		super(
			options.model || DEFAULT_MODELS.openrouter,
			"openrouter",
			options.timeout,
		);

		const apiKey = options.apiKey || getApiKey();
		if (!apiKey) {
			throw new Error(
				"OpenRouter API key required. Set OPENROUTER_API_KEY environment variable or run 'claudemem init'",
			);
		}
		this.apiKey = apiKey;
	}

	async embed(
		texts: string[],
		onProgress?: EmbeddingProgressCallback,
	): Promise<EmbedResult> {
		if (texts.length === 0) return { embeddings: [] };

		// Split into batches
		const batches: string[][] = [];
		for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
			batches.push(texts.slice(i, i + MAX_BATCH_SIZE));
		}

		// Process batches in parallel (5 at a time for speed)
		const PARALLEL_BATCHES = 5;
		const results: number[][] = new Array(texts.length);
		let resultIndex = 0;
		let completedTexts = 0;
		let totalTokens = 0;
		let totalCost = 0;

		let failedCount = 0;
		const warnings: string[] = [];

		for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
			const batchGroup = batches.slice(i, i + PARALLEL_BATCHES);
			const inProgressCount = batchGroup.reduce((sum, b) => sum + b.length, 0);

			// Report "starting to process" with in-progress count (for animation)
			if (onProgress) {
				onProgress(completedTexts, texts.length, inProgressCount);
			}

			// Wrap each batch in try-catch to continue on failure
			const batchPromises = batchGroup.map(async (batch) => {
				try {
					return await this.embedBatch(batch);
				} catch (error) {
					// Return empty embeddings for failed batch
					const msg = error instanceof Error ? error.message : String(error);
					// Auth errors should fail fast
					if (msg.includes("401") || msg.includes("403")) {
						throw error;
					}
					warnings.push(msg);
					failedCount += batch.length;
					return { embeddings: batch.map(() => [] as number[]) };
				}
			});
			const batchResults = await Promise.all(batchPromises);

			for (const batchResult of batchResults) {
				for (const embedding of batchResult.embeddings) {
					results[resultIndex++] = embedding;
				}
				completedTexts += batchResult.embeddings.length;
				if (batchResult.totalTokens) totalTokens += batchResult.totalTokens;
				if (batchResult.cost) totalCost += batchResult.cost;
			}
		}

		if (failedCount > 0) {
			warnings.push(`${failedCount}/${texts.length} chunks skipped`);
		}

		// Final progress report (all complete)
		if (onProgress) {
			onProgress(completedTexts, texts.length, 0);
		}

		return {
			embeddings: results,
			totalTokens: totalTokens > 0 ? totalTokens : undefined,
			cost: totalCost > 0 ? totalCost : undefined,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	}

	private async embedBatch(texts: string[]): Promise<EmbedResult> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const response = await this.makeRequest(texts);

				if (response.embeddings.length > 0 && !this.dimension) {
					this.dimension = response.embeddings[0].length;
				}

				return {
					embeddings: response.embeddings,
					totalTokens: response.usage?.totalTokens,
					cost: response.usage?.cost,
				};
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// Don't retry on authentication errors
				if (
					lastError.message.includes("401") ||
					lastError.message.includes("403")
				) {
					throw lastError;
				}

				if (attempt < MAX_RETRIES - 1) {
					const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
					await this.sleep(delay);
				}
			}
		}

		throw lastError || new Error("Failed to generate embeddings");
	}

	private async makeRequest(texts: string[]): Promise<EmbeddingResponse> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json",
					...OPENROUTER_HEADERS,
				},
				body: JSON.stringify({
					model: this.model,
					input: texts,
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`OpenRouter API error: ${response.status} - ${errorText}`,
				);
			}

			const data: OpenRouterEmbeddingResponse = await response.json();
			const sorted = [...data.data].sort((a, b) => a.index - b.index);

			return {
				embeddings: sorted.map((item) => item.embedding),
				model: data.model,
				usage: data.usage
					? {
							promptTokens: data.usage.prompt_tokens,
							totalTokens: data.usage.total_tokens,
							cost: data.usage.cost,
						}
					: undefined,
			};
		} finally {
			clearTimeout(timeoutId);
		}
	}
}

// ============================================================================
// Ollama Client
// ============================================================================

export class OllamaEmbeddingsClient extends BaseEmbeddingsClient {
	private endpoint: string;

	constructor(options: EmbeddingsClientOptions = {}) {
		super(options.model || DEFAULT_MODELS.ollama, "ollama", options.timeout);
		this.endpoint = options.endpoint || DEFAULT_OLLAMA_ENDPOINT;
	}

	async embed(
		texts: string[],
		onProgress?: EmbeddingProgressCallback,
	): Promise<EmbedResult> {
		if (texts.length === 0) return { embeddings: [] };

		// Ollama processes one text at a time
		const results: number[][] = [];
		let failedCount = 0;
		const warnings: string[] = [];

		for (let i = 0; i < texts.length; i++) {
			// Report "starting to process" (1 item at a time)
			if (onProgress) {
				onProgress(i, texts.length, 1);
			}

			try {
				const embedding = await this.embedSingle(texts[i]);
				results.push(embedding);

				// Store dimension on first result
				if (!this.dimension && embedding.length > 0) {
					this.dimension = embedding.length;
				}
			} catch (error) {
				// Skip failed chunks instead of stopping entire process
				// Return empty embedding - caller should filter these out
				results.push([]);
				failedCount++;

				// Connection errors should fail fast
				const msg = error instanceof Error ? error.message : String(error);
				if (msg.includes("ECONNREFUSED") || msg.includes("Cannot connect")) {
					throw error;
				}
				warnings.push(`Chunk ${i + 1}: ${msg}`);
			}
		}

		// Final progress report
		if (onProgress) {
			onProgress(texts.length, texts.length, 0);
		}

		if (failedCount > 0) {
			warnings.push(`${failedCount}/${texts.length} chunks skipped`);
		}

		// Ollama doesn't report cost (local model)
		return { embeddings: results, warnings: warnings.length > 0 ? warnings : undefined };
	}

	private async embedSingle(text: string): Promise<number[]> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), this.timeout);

				try {
					const response = await fetch(`${this.endpoint}/api/embeddings`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							model: this.model,
							prompt: text,
						}),
						signal: controller.signal,
					});

					if (!response.ok) {
						const errorText = await response.text();
						throw new Error(
							`Ollama API error: ${response.status} - ${errorText}`,
						);
					}

					const data: OllamaEmbeddingResponse = await response.json();
					return data.embedding;
				} finally {
					clearTimeout(timeoutId);
				}
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// Check if Ollama is not running
				if (lastError.message.includes("ECONNREFUSED")) {
					throw new Error(
						`Cannot connect to Ollama at ${this.endpoint}. Is Ollama running? Try: ollama serve`,
					);
				}

				if (attempt < MAX_RETRIES - 1) {
					const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
					await this.sleep(delay);
				}
			}
		}

		throw lastError || new Error("Failed to generate embeddings");
	}
}

// ============================================================================
// Local/Custom Endpoint Client
// ============================================================================

export class LocalEmbeddingsClient extends BaseEmbeddingsClient {
	private endpoint: string;
	// Smaller batch size for local models to show progress more frequently
	private static readonly LOCAL_BATCH_SIZE = 10;

	constructor(
		options: EmbeddingsClientOptions = {},
		provider: "local" | "lmstudio" = "local",
	) {
		super(options.model || DEFAULT_MODELS[provider], provider, options.timeout);
		this.endpoint = options.endpoint || DEFAULT_LOCAL_ENDPOINT;
	}

	async embed(
		texts: string[],
		onProgress?: EmbeddingProgressCallback,
	): Promise<EmbedResult> {
		if (texts.length === 0) return { embeddings: [] };

		// Split into batches for progress reporting
		const batches: string[][] = [];
		for (
			let i = 0;
			i < texts.length;
			i += LocalEmbeddingsClient.LOCAL_BATCH_SIZE
		) {
			batches.push(texts.slice(i, i + LocalEmbeddingsClient.LOCAL_BATCH_SIZE));
		}

		const results: number[][] = [];
		let completedTexts = 0;

		for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
			const batch = batches[batchIdx];

			// Report progress before processing this batch
			if (onProgress) {
				onProgress(completedTexts, texts.length, batch.length);
			}

			const batchResult = await this.embedBatch(batch);
			results.push(...batchResult);
			completedTexts += batch.length;
		}

		// Final progress report
		if (onProgress) {
			onProgress(texts.length, texts.length, 0);
		}

		return { embeddings: results };
	}

	/**
	 * Embed a single batch of texts
	 */
	private async embedBatch(texts: string[]): Promise<number[][]> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), this.timeout);

				try {
					// OpenAI-compatible format
					const response = await fetch(`${this.endpoint}/embeddings`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							model: this.model,
							input: texts,
						}),
						signal: controller.signal,
					});

					if (!response.ok) {
						const errorText = await response.text();
						throw new Error(
							`Local API error: ${response.status} - ${errorText}`,
						);
					}

					const data: OpenRouterEmbeddingResponse = await response.json();
					const sorted = [...data.data].sort((a, b) => a.index - b.index);
					const embeddings = sorted.map((item) => item.embedding);

					if (embeddings.length > 0 && !this.dimension) {
						this.dimension = embeddings[0].length;
					}

					return embeddings;
				} finally {
					clearTimeout(timeoutId);
				}
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (lastError.message.includes("ECONNREFUSED")) {
					throw new Error(
						`Cannot connect to local embedding server at ${this.endpoint}. Is it running?`,
					);
				}

				if (attempt < MAX_RETRIES - 1) {
					const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
					await this.sleep(delay);
				}
			}
		}

		throw lastError || new Error("Failed to generate embeddings");
	}
}

// ============================================================================
// Voyage AI Client
// ============================================================================

/** Voyage model pricing per million tokens (USD) */
const VOYAGE_PRICING: Record<string, number> = {
	"voyage-3-large": 0.18,
	"voyage-context-3": 0.18,
	"voyage-3.5": 0.06,
	"voyage-3.5-lite": 0.02,
	"voyage-code-3": 0.18,
	"voyage-finance-2": 0.12,
	"voyage-law-2": 0.12,
	"voyage-code-2": 0.12,
	"voyage-multilingual-2": 0.12,
	"voyage-3": 0.06,
	"voyage-3-lite": 0.02,
	// Older models
	"voyage-large-2": 0.12,
	"voyage-2": 0.1,
};

export class VoyageEmbeddingsClient extends BaseEmbeddingsClient {
	private apiKey: string;

	constructor(options: EmbeddingsClientOptions = {}) {
		super(options.model || DEFAULT_MODELS.voyage, "voyage", options.timeout);

		const apiKey = options.apiKey || getVoyageApiKey();
		if (!apiKey) {
			throw new Error(
				"Voyage API key required. Set VOYAGE_API_KEY environment variable or get one at:\nhttps://dashboard.voyageai.com/organization/api-keys",
			);
		}
		this.apiKey = apiKey;
	}

	async embed(
		texts: string[],
		onProgress?: EmbeddingProgressCallback,
	): Promise<EmbedResult> {
		if (texts.length === 0) return { embeddings: [] };

		// Voyage supports batching up to 128 texts, use smaller batches for progress
		const batches: string[][] = [];
		for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
			batches.push(texts.slice(i, i + MAX_BATCH_SIZE));
		}

		// Process batches in parallel (5 at a time)
		const PARALLEL_BATCHES = 5;
		const results: number[][] = new Array(texts.length);
		let resultIndex = 0;
		let completedTexts = 0;
		let totalTokens = 0;

		let failedCount = 0;
		const warnings: string[] = [];

		for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
			const batchGroup = batches.slice(i, i + PARALLEL_BATCHES);
			const inProgressCount = batchGroup.reduce((sum, b) => sum + b.length, 0);

			if (onProgress) {
				onProgress(completedTexts, texts.length, inProgressCount);
			}

			// Wrap each batch in try-catch to continue on failure
			const batchPromises = batchGroup.map(async (batch) => {
				try {
					return await this.embedBatch(batch);
				} catch (error) {
					const msg = error instanceof Error ? error.message : String(error);
					// Auth errors should fail fast
					if (msg.includes("401") || msg.includes("403")) {
						throw error;
					}
					warnings.push(msg);
					failedCount += batch.length;
					return { embeddings: batch.map(() => [] as number[]) };
				}
			});
			const batchResults = await Promise.all(batchPromises);

			for (const batchResult of batchResults) {
				for (const embedding of batchResult.embeddings) {
					results[resultIndex++] = embedding;
				}
				completedTexts += batchResult.embeddings.length;
				if (batchResult.totalTokens) totalTokens += batchResult.totalTokens;
			}
		}

		if (failedCount > 0) {
			warnings.push(`${failedCount}/${texts.length} chunks skipped`);
		}

		if (onProgress) {
			onProgress(completedTexts, texts.length, 0);
		}

		// Calculate cost from tokens using pricing table
		const cost = totalTokens > 0 ? this.calculateCost(totalTokens) : undefined;

		return {
			embeddings: results,
			totalTokens: totalTokens > 0 ? totalTokens : undefined,
			cost,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	}

	/** Calculate cost in USD from token count */
	private calculateCost(tokens: number): number {
		const pricePerMillion = VOYAGE_PRICING[this.model] ?? 0.12; // Default to $0.12/M
		return (tokens / 1_000_000) * pricePerMillion;
	}

	private async embedBatch(texts: string[]): Promise<EmbedResult> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), this.timeout);

				try {
					const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
						method: "POST",
						headers: {
							Authorization: `Bearer ${this.apiKey}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: this.model,
							input: texts,
						}),
						signal: controller.signal,
					});

					if (!response.ok) {
						const errorText = await response.text();
						throw new Error(
							`Voyage API error: ${response.status} - ${errorText}`,
						);
					}

					const data = (await response.json()) as {
						data: Array<{ embedding: number[]; index: number }>;
						usage?: { total_tokens: number };
					};

					const sorted = [...data.data].sort((a, b) => a.index - b.index);
					const embeddings = sorted.map((item) => item.embedding);

					if (embeddings.length > 0 && !this.dimension) {
						this.dimension = embeddings[0].length;
					}

					return {
						embeddings,
						totalTokens: data.usage?.total_tokens,
					};
				} finally {
					clearTimeout(timeoutId);
				}
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// Don't retry on authentication errors
				if (
					lastError.message.includes("401") ||
					lastError.message.includes("403")
				) {
					throw lastError;
				}

				if (attempt < MAX_RETRIES - 1) {
					const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
					await this.sleep(delay);
				}
			}
		}

		throw lastError || new Error("Failed to generate embeddings");
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Check if a model ID is a Voyage model
 */
export function isVoyageModel(modelId: string): boolean {
	return modelId.startsWith("voyage-");
}

/**
 * Check if a model ID is an Ollama model (ollama/ prefix)
 */
export function isOllamaModel(modelId: string): boolean {
	return modelId.startsWith("ollama/");
}

/**
 * Extract actual model name from prefixed model ID
 * e.g., "ollama/nomic-embed-code" -> "nomic-embed-code"
 */
function extractModelName(modelId: string): string {
	if (modelId.includes("/")) {
		const parts = modelId.split("/");
		// For ollama/model, return just the model part
		if (parts[0] === "ollama") {
			return parts.slice(1).join("/");
		}
	}
	return modelId;
}

/**
 * Create an embeddings client based on provider
 * Auto-detects:
 * - Voyage models (voyage-*) -> Voyage provider
 * - Ollama models (ollama/*) -> Ollama provider
 */
export function createEmbeddingsClient(
	options?: EmbeddingsClientOptions,
): IEmbeddingsClient {
	// Determine provider from options or config
	const config = loadGlobalConfig();
	let provider = options?.provider || config.embeddingProvider;
	// Use config default model (voyage-3.5-lite) if not specified
	let model = options?.model || config.defaultModel || DEFAULT_EMBEDDING_MODEL;

	// Auto-detect provider from model prefix (overrides config provider)
	if (isVoyageModel(model)) {
		provider = "voyage";
	} else if (isOllamaModel(model)) {
		provider = "ollama";
		model = extractModelName(model); // Strip "ollama/" prefix
	} else if (!provider) {
		// Fall back to openrouter only if no provider detected
		provider = "openrouter";
	}

	switch (provider) {
		case "ollama":
			return new OllamaEmbeddingsClient({
				...options,
				model,
				endpoint: options?.endpoint || config.ollamaEndpoint,
			});

		case "lmstudio":
			// LM Studio uses OpenAI-compatible API
			return new LocalEmbeddingsClient(
				{
					...options,
					model,
					endpoint:
						options?.endpoint ||
						config.lmstudioEndpoint ||
						"http://localhost:1234/v1",
				},
				"lmstudio",
			);

		case "local":
			return new LocalEmbeddingsClient(
				{
					...options,
					model,
					endpoint: options?.endpoint || config.localEndpoint,
				},
				"local",
			);

		case "voyage":
			return new VoyageEmbeddingsClient({ ...options, model });

		case "openrouter":
		default:
			return new OpenRouterEmbeddingsClient({ ...options, model });
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate the number of tokens in a text
 * Conservative approximation: ~3 characters per token for code
 * (code has more special chars/keywords that tokenize individually)
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 3);
}

/**
 * Check if a text is too long for the model's context window
 */
export function isTextTooLong(text: string, maxTokens: number): boolean {
	return estimateTokens(text) > maxTokens;
}

/**
 * Truncate text to fit within token limit
 * Uses 2 chars per token as a safe estimate for code (tokenizers vary)
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
	const maxChars = maxTokens * 2; // Safe: 2 chars per token for code
	if (text.length <= maxChars) {
		return text;
	}
	return text.slice(0, maxChars - 3) + "...";
}

/**
 * Get the context length (in tokens) for a model
 * Returns default of 8192 if unknown
 */
export function getModelContextLength(modelId: string): number {
	// Check direct match
	if (MODEL_CONTEXT_LENGTHS[modelId]) {
		return MODEL_CONTEXT_LENGTHS[modelId];
	}
	// Check without provider prefix (e.g., "ollama/nomic-embed-text" -> "nomic-embed-text")
	const modelName = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
	if (MODEL_CONTEXT_LENGTHS[modelName]) {
		return MODEL_CONTEXT_LENGTHS[modelName];
	}
	// Default context length
	return 8192;
}

/**
 * Truncate texts to fit within model's context window
 */
export function truncateForModel(texts: string[], modelId: string): string[] {
	const maxTokens = getModelContextLength(modelId);
	return texts.map((text) => truncateToTokenLimit(text, maxTokens));
}

/**
 * Test connection to an embedding provider
 */
export async function testProviderConnection(
	provider: EmbeddingProvider,
	endpoint?: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const client = createEmbeddingsClient({
			provider,
			endpoint,
		});
		await client.embedOne("test");
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
```


### `eval/embedding-benchmark.ts`
```typescript
/**
 * Embedding Model Benchmark
 *
 * Compares embedding models by running retrieval evaluation
 * (P@1, P@5, MRR) using existing summaries + queries from benchmark DB.
 *
 * Usage:
 *   bun run eval/embedding-benchmark.ts
 *
 * Requires: LM Studio running at http://localhost:1234 with embedding models loaded.
 */

import Database from "bun:sqlite";

// ============================================================================
// Config
// ============================================================================

const LMSTUDIO_ENDPOINT = "http://localhost:1234/v1";

const EMBEDDING_MODELS = [
	// Embedding tab models
	"text-embedding-qwen3-embedding-0.6b",
	"text-embedding-nomic-embed-code",
	"text-embedding-embeddinggemma-300m",
	"text-embedding-mxbai-embed-large-v1",
	"text-embedding-mxbai-embed-xsmall-v1",
	// LLM tab models (embedding models that LM Studio doesn't auto-detect)
	"snowflake-arctic-embed-l-v2.0",
	"nomicai-modernbert-embed-base",
];

// Use the Dec 2025 run (31 models, 37 code units, 296 queries — harder)
const RUN_ID = "b8bc58da-b0ef-4c6b-b3fe-70ad64ad4170";
const DB_PATH = ".claudemem/benchmark.db";
const K_VALUES = [1, 3, 5, 10];

// ============================================================================
// Types
// ============================================================================

interface Summary {
	id: string;
	codeUnitId: string;
	modelId: string;
	summary: string;
}

interface Query {
	id: string;
	codeUnitId: string;
	type: string;
	query: string;
}

interface EmbedResult {
	model: string;
	dim: number;
	p1: number;
	p5: number;
	mrr: number;
	winRate: number;
	embedTimeMs: number;
	queryTimeMs: number;
}

// ============================================================================
// Embedding API
// ============================================================================

async function embed(model: string, texts: string[]): Promise<number[][]> {
	const BATCH_SIZE = 20;
	const allEmbeddings: number[][] = [];

	for (let i = 0; i < texts.length; i += BATCH_SIZE) {
		const batch = texts.slice(i, i + BATCH_SIZE);
		const resp = await fetch(`${LMSTUDIO_ENDPOINT}/embeddings`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model, input: batch }),
		});

		if (!resp.ok) {
			const err = await resp.text();
			throw new Error(`Embed failed for ${model}: ${resp.status} ${err}`);
		}

		const data = await resp.json() as { data: Array<{ embedding: number[]; index: number }> };
		const sorted = [...data.data].sort((a, b) => a.index - b.index);
		allEmbeddings.push(...sorted.map(d => d.embedding));
	}

	return allEmbeddings;
}

async function embedOne(model: string, text: string): Promise<number[]> {
	const results = await embed(model, [text]);
	return results[0];
}

// ============================================================================
// Vector Math
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom > 0 ? dot / denom : 0;
}

// ============================================================================
// Retrieval Evaluation
// ============================================================================

async function evaluateModel(
	model: string,
	summaries: Summary[],
	queries: Query[],
): Promise<EmbedResult> {
	// 1. Embed all summaries
	const summaryTexts = summaries.map(s => s.summary);
	const t0 = Date.now();
	const summaryEmbeddings = await embed(model, summaryTexts);
	const embedTimeMs = Date.now() - t0;

	const dim = summaryEmbeddings[0]?.length ?? 0;

	// Build index: array of { codeUnitId, modelId, embedding }
	const index = summaries.map((s, i) => ({
		codeUnitId: s.codeUnitId,
		modelId: s.modelId,
		embedding: summaryEmbeddings[i],
	}));

	// 2. Evaluate each query
	let totalMRR = 0;
	let hitsAt1 = 0;
	let hitsAt5 = 0;
	let wins = 0;
	let totalQueries = 0;

	const t1 = Date.now();

	for (const query of queries) {
		const queryEmbedding = await embedOne(model, query.query);

		// Score all summaries
		const scores = index.map((entry, i) => ({
			...entry,
			score: cosineSimilarity(queryEmbedding, entry.embedding),
		}));
		scores.sort((a, b) => b.score - a.score);

		// Find rank of first match for target code unit
		const rank = scores.findIndex(s => s.codeUnitId === query.codeUnitId) + 1;

		if (rank > 0) {
			totalMRR += 1 / rank;
			if (rank <= 1) hitsAt1++;
			if (rank <= 5) hitsAt5++;
			if (rank === 1) wins++;
		}
		totalQueries++;

		// Progress
		if (totalQueries % 20 === 0) {
			process.stdout.write(`\r  ${model}: ${totalQueries}/${queries.length} queries...`);
		}
	}

	const queryTimeMs = Date.now() - t1;

	process.stdout.write(`\r  ${model}: ${totalQueries}/${queries.length} queries ✓\n`);

	return {
		model,
		dim,
		p1: hitsAt1 / totalQueries,
		p5: hitsAt5 / totalQueries,
		mrr: totalMRR / totalQueries,
		winRate: wins / totalQueries,
		embedTimeMs,
		queryTimeMs,
	};
}

// ============================================================================
// Main
// ============================================================================

async function main() {
	console.log("╭─ Embedding Model Benchmark ────────────────────────────────────╮");
	console.log("│ Comparing retrieval quality across embedding models            │");
	console.log("│ Using existing benchmark summaries + queries from benchmark DB │");
	console.log("╰────────────────────────────────────────────────────────────────╯\n");

	// Load data from SQLite
	const db = new Database(DB_PATH, { readonly: true });

	const summaries = db.query<Summary, [string]>(
		"SELECT id, code_unit_id as codeUnitId, model_id as modelId, summary FROM generated_summaries WHERE run_id = ?",
	).all(RUN_ID);

	const queries = db.query<Query, [string]>(
		"SELECT id, code_unit_id as codeUnitId, type, query FROM generated_queries WHERE run_id = ?",
	).all(RUN_ID);

	db.close();

	console.log(`Run: ${RUN_ID}`);
	console.log(`Summaries: ${summaries.length} (${new Set(summaries.map(s => s.modelId)).size} generator models)`);
	console.log(`Queries: ${queries.length}`);
	console.log(`Code units: ${new Set(summaries.map(s => s.codeUnitId)).size}`);
	console.log(`Embedding models to test: ${EMBEDDING_MODELS.length}\n`);

	// Quick connectivity check
	try {
		const resp = await fetch(`${LMSTUDIO_ENDPOINT}/models`);
		if (!resp.ok) throw new Error("LM Studio not responding");
	} catch {
		console.error("ERROR: LM Studio not running at http://localhost:1234");
		console.error("Start LM Studio and load embedding models first.");
		process.exit(1);
	}

	// Run benchmark for each model
	const results: EmbedResult[] = [];

	for (const model of EMBEDDING_MODELS) {
		console.log(`Testing: ${model}`);
		try {
			const result = await evaluateModel(model, summaries, queries);
			results.push(result);
		} catch (err) {
			console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
		}
	}

	// Also test Ollama models if available
	const ollamaModels = ["nomic-embed-text", "snowflake-arctic-embed2"];
	for (const model of ollamaModels) {
		console.log(`Testing (Ollama): ${model}`);
		try {
			// Embed via Ollama API (one at a time)
			const result = await evaluateModelOllama(model, summaries, queries);
			results.push(result);
		} catch (err) {
			console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
		}
	}

	// Print results table
	console.log("\n╭─ Results ────────────────────────────────────────────────────────────────────────────────╮");
	console.log("│ Model                              │ Dim  │ P@1    │ P@5    │ MRR    │ Embed  │ Query  │");
	console.log("├────────────────────────────────────┼──────┼────────┼────────┼────────┼────────┼────────┤");

	// Sort by MRR descending
	results.sort((a, b) => b.mrr - a.mrr);

	for (const r of results) {
		const name = r.model.replace("text-embedding-", "").padEnd(36).slice(0, 36);
		const dim = String(r.dim).padStart(4);
		const p1 = r.p1.toFixed(3).padStart(6);
		const p5 = r.p5.toFixed(3).padStart(6);
		const mrr = r.mrr.toFixed(3).padStart(6);
		const et = `${(r.embedTimeMs / 1000).toFixed(1)}s`.padStart(6);
		const qt = `${(r.queryTimeMs / 1000).toFixed(1)}s`.padStart(6);
		console.log(`│ ${name} │ ${dim} │ ${p1} │ ${p5} │ ${mrr} │ ${et} │ ${qt} │`);
	}
	console.log("╰────────────────────────────────────┴──────┴────────┴────────┴────────┴────────┴────────╯");

	// Summary
	const best = results[0];
	if (best) {
		console.log(`\nBest: ${best.model} (MRR ${best.mrr.toFixed(3)}, P@1 ${best.p1.toFixed(3)}, dim=${best.dim})`);
	}
}

// ============================================================================
// Ollama embedding (one-at-a-time API)
// ============================================================================

async function ollamaEmbed(model: string, text: string): Promise<number[]> {
	const resp = await fetch("http://localhost:11434/api/embeddings", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ model, prompt: text }),
	});
	if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
	const data = await resp.json() as { embedding: number[] };
	return data.embedding;
}

async function evaluateModelOllama(
	model: string,
	summaries: Summary[],
	queries: Query[],
): Promise<EmbedResult> {
	// Embed all summaries one at a time (Ollama API)
	const t0 = Date.now();
	const summaryEmbeddings: number[][] = [];
	for (let i = 0; i < summaries.length; i++) {
		summaryEmbeddings.push(await ollamaEmbed(model, summaries[i].summary));
		if ((i + 1) % 10 === 0) {
			process.stdout.write(`\r  ${model}: embedding ${i + 1}/${summaries.length}...`);
		}
	}
	const embedTimeMs = Date.now() - t0;

	const dim = summaryEmbeddings[0]?.length ?? 0;

	const index = summaries.map((s, i) => ({
		codeUnitId: s.codeUnitId,
		modelId: s.modelId,
		embedding: summaryEmbeddings[i],
	}));

	let totalMRR = 0, hitsAt1 = 0, hitsAt5 = 0, wins = 0, totalQueries = 0;

	const t1 = Date.now();
	for (const query of queries) {
		const queryEmbedding = await ollamaEmbed(model, query.query);
		const scores = index.map(entry => ({
			...entry,
			score: cosineSimilarity(queryEmbedding, entry.embedding),
		}));
		scores.sort((a, b) => b.score - a.score);

		const rank = scores.findIndex(s => s.codeUnitId === query.codeUnitId) + 1;
		if (rank > 0) {
			totalMRR += 1 / rank;
			if (rank <= 1) hitsAt1++;
			if (rank <= 5) hitsAt5++;
			if (rank === 1) wins++;
		}
		totalQueries++;
		if (totalQueries % 10 === 0) {
			process.stdout.write(`\r  ${model}: ${totalQueries}/${queries.length} queries...`);
		}
	}
	const queryTimeMs = Date.now() - t1;

	process.stdout.write(`\r  ${model}: ${totalQueries}/${queries.length} queries ✓\n`);

	return {
		model: `ollama/${model}`,
		dim,
		p1: hitsAt1 / totalQueries,
		p5: hitsAt5 / totalQueries,
		mrr: totalMRR / totalQueries,
		winRate: wins / totalQueries,
		embedTimeMs,
		queryTimeMs,
	};
}

main().catch(console.error);
```

