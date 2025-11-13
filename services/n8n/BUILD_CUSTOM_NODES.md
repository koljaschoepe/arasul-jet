# n8n Custom Nodes - Build Documentation

## Overview

Arasul Platform includes custom n8n nodes for interacting with the local LLM and Embeddings services. These nodes are TypeScript packages that must be compiled before use.

**Package Status**: ✅ Fully Configured and Building

## Custom Nodes

1. **n8n-nodes-arasul-llm**
   - Node: `ArasulLlm` - Interact with Ollama LLM service
   - Credentials: `ArasulLlmApi` - API endpoint configuration
   - Location: `services/n8n/custom-nodes/n8n-nodes-arasul-llm/`

2. **n8n-nodes-arasul-embeddings**
   - Node: `ArasulEmbeddings` - Generate text embeddings
   - Credentials: `ArasulEmbeddingsApi` - API endpoint configuration
   - Location: `services/n8n/custom-nodes/n8n-nodes-arasul-embeddings/`

## Build Process

### Local Development Build

To compile the TypeScript source code locally:

```bash
# Build LLM Node
cd services/n8n/custom-nodes/n8n-nodes-arasul-llm
npm install --production=false
npm run build

# Build Embeddings Node
cd services/n8n/custom-nodes/n8n-nodes-arasul-embeddings
npm install --production=false
npm run build
```

### Docker Build (Production)

The custom nodes are automatically compiled during Docker image build via the multi-stage Dockerfile:

```bash
# Build n8n service with custom nodes
docker-compose build n8n

# Or rebuild entire stack
docker-compose build
```

## Project Structure

Each custom node package follows this structure:

```
n8n-nodes-arasul-llm/
├── package.json           # npm package configuration
├── tsconfig.json          # TypeScript compiler configuration
├── gulpfile.js            # Icon copy task
├── nodes/
│   └── ArasulLlm/
│       └── ArasulLlm.node.ts   # Node implementation
├── credentials/
│   └── ArasulLlmApi.credentials.ts  # Credentials definition
└── dist/                  # Compiled output (generated)
    ├── nodes/
    │   └── ArasulLlm/
    │       ├── ArasulLlm.node.js
    │       ├── ArasulLlm.node.d.ts
    │       └── ArasulLlm.node.js.map
    └── credentials/
        ├── ArasulLlmApi.credentials.js
        ├── ArasulLlmApi.credentials.d.ts
        └── ArasulLlmApi.credentials.js.map
```

## Configuration Files

### tsconfig.json

TypeScript compiler configuration:
- **Target**: ES2020
- **Module**: CommonJS
- **Output**: `dist/` directory
- **Source Maps**: Enabled with inline sources
- **Strict Mode**: Enabled

### package.json

Key sections:
- `n8n.nodes`: Points to compiled `.js` files in `dist/`
- `n8n.credentials`: Points to compiled credential files
- `scripts.build`: Runs `tsc && gulp build:icons`

### gulpfile.js

Simple Gulp task to copy icon files (`.png`, `.svg`) from source to `dist/nodes/`.

## Docker Multi-Stage Build

The `services/n8n/Dockerfile` uses a multi-stage build:

**Stage 1: Builder**
- Base: `node:18-alpine`
- Copies both custom node packages
- Runs `npm install` and `npm run build` for each
- Compiles TypeScript to JavaScript

**Stage 2: Final Image**
- Base: `n8nio/n8n:latest`
- Copies compiled `dist/` directories from builder
- Copies `package.json` and `node_modules`
- Sets `N8N_CUSTOM_EXTENSIONS=/custom-nodes`

## Verification

### After Local Build

Check that compiled files exist:

```bash
# LLM Node
ls -la services/n8n/custom-nodes/n8n-nodes-arasul-llm/dist/nodes/ArasulLlm/
ls -la services/n8n/custom-nodes/n8n-nodes-arasul-llm/dist/credentials/

# Embeddings Node
ls -la services/n8n/custom-nodes/n8n-nodes-arasul-embeddings/dist/nodes/ArasulEmbeddings/
ls -la services/n8n/custom-nodes/n8n-nodes-arasul-embeddings/dist/credentials/
```

Expected output for each:
- `.js` files (compiled JavaScript)
- `.d.ts` files (TypeScript type definitions)
- `.js.map` files (source maps)

### After Docker Build

```bash
# Check that n8n service built successfully
docker-compose ps n8n

# Verify custom nodes are loaded
docker-compose logs n8n | grep -i "arasul"

# Access n8n UI and check node palette
# The custom nodes should appear under "Arasul" category
```

## Troubleshooting

### TypeScript Compilation Errors

If `npm run build` fails:

1. Check TypeScript version: `npx tsc --version` (should be ~4.9.x)
2. Verify all dependencies installed: `npm install --production=false`
3. Check for syntax errors in `.ts` files
4. Review `tsconfig.json` for incompatible options

### Docker Build Errors

If `docker-compose build n8n` fails:

1. Check Dockerfile syntax
2. Verify custom node packages have `package.json`, `tsconfig.json`, `gulpfile.js`
3. Ensure no missing dependencies in `package.json`
4. Check Docker build logs: `docker-compose build n8n --progress=plain`

### Nodes Not Appearing in n8n UI

If custom nodes don't appear in n8n after deployment:

1. Check `N8N_CUSTOM_EXTENSIONS` environment variable is set to `/custom-nodes`
2. Verify compiled files exist in Docker image:
   ```bash
   docker exec n8n ls -la /custom-nodes/n8n-nodes-arasul-llm/dist/nodes/
   ```
3. Check n8n logs for loading errors:
   ```bash
   docker-compose logs n8n | grep -i error
   ```
4. Verify `package.json` has correct `n8n.nodes` and `n8n.credentials` paths

## Development Workflow

### Modifying Existing Nodes

1. Edit `.ts` files in `nodes/` or `credentials/`
2. Run `npm run build` locally to test compilation
3. Rebuild Docker image: `docker-compose build n8n`
4. Restart service: `docker-compose up -d n8n`

### Adding New Nodes

1. Create new `.node.ts` file in appropriate package's `nodes/` directory
2. Add corresponding `.credentials.ts` if needed
3. Update `package.json` `n8n.nodes` and `n8n.credentials` arrays
4. Run `npm run build` to test
5. Rebuild Docker image

### Watch Mode (Development)

For rapid iteration during development:

```bash
cd services/n8n/custom-nodes/n8n-nodes-arasul-llm
npm run dev  # Runs tsc --watch
```

TypeScript will automatically recompile on file changes.

## Dependencies

### Build Dependencies

Each package requires:
- `typescript` (~4.9.4)
- `gulp` (~4.0.2)
- `n8n-workflow` (~1.0.0) - peer dependency
- `eslint` + plugins (optional, for linting)

### Runtime Dependencies

- `axios` (~1.6.0) - HTTP client for API requests

## Performance Considerations

- **Build Time**: Each package takes ~2-5 seconds to compile
- **Image Size**: Compiled nodes add ~2-5 MB to n8n Docker image
- **Runtime Impact**: Negligible - nodes are loaded once at startup

## Security Notes

- Custom nodes run in the same process as n8n
- Credentials are stored encrypted in n8n database
- API endpoints should use HTTPS in production (configure via credentials)
- No sensitive data should be hardcoded in node source

## References

- [n8n Custom Node Documentation](https://docs.n8n.io/integrations/creating-nodes/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [n8n-workflow API](https://github.com/n8n-io/n8n/tree/master/packages/workflow)

## Task Completion

This documentation covers the implementation of **Task 4.1** from `TASKS.md`:

✅ Created `tsconfig.json` for both packages
✅ Created `gulpfile.js` for both packages
✅ Created multi-stage Dockerfile for n8n
✅ Updated `docker-compose.yml` to use custom build
✅ Verified TypeScript compilation works locally
✅ Documented complete build process

**Status**: Ready for production deployment
