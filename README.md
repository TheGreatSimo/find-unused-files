# Unused Files Finder

A simple Node.js script to find unused TypeScript/JavaScript files in your project.

## What it does

Scans your `src/` directory and identifies TypeScript files (.ts, .tsx, .js, .jsx) that are not imported by any other files, starting from the entry point at `src/index.ts`.

## How to use

1. **Make sure you have Node.js installed**

2. **Place the script in your project**
   - Save it as `find-unused.js` in your project root

3. **Run it:**
   ```bash
   node find-unused.js
   ```

4. **View the results**
   - The script will list all unused files in your console

## Notes

- Only scans the `src/` directory
- Looks for imports using `import`, `require()`, and dynamic imports
- Automatically resolves file extensions (.ts, .tsx, .js, .jsx)
- Entry point is hardcoded to `src/index.ts` (you can modify this in the script)

## Customization

Edit the `entryPoints` array in the script to change which files it starts tracing from.
