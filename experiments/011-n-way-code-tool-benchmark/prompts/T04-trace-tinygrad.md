In the `{{repo}}` codebase at `{{repo_path}}`, trace what happens when `Tensor.realize()` is called.

Specifically: starting from `Tensor.realize`, how does tinygrad schedule and execute the lazy computation graph?

Provide:
1. The entry point: `Tensor.realize` — its file and line
2. The scheduling path: which files and functions are involved in turning the lazy graph into scheduled operations
3. The execution path: how scheduled operations are dispatched to a device backend for actual execution
4. At least 3 distinct files involved in this path

Name the actual functions and file paths from the source code.
