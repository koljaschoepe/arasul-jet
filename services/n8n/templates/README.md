# n8n Workflow Templates for Arasul Platform

This directory contains pre-configured n8n workflow templates and HTTP request configurations for easy integration with Arasul services.

## Available Templates

### 1. LLM Chat Workflow
**File**: `llm-chat-workflow.json`

A basic workflow that demonstrates:
- Webhook trigger for incoming requests
- Arasul LLM node for chat completion
- Response formatting

**Usage**:
1. Import workflow via n8n UI
2. Configure Arasul LLM credentials
3. Activate workflow
4. Send POST request to webhook URL with `{"message": "Your prompt"}`

### 2. Document Embedding Pipeline
**File**: `document-embedding-pipeline.json`

An advanced workflow for document processing:
- Webhook/Schedule trigger
- MinIO file retrieval
- Text extraction
- Batch embedding generation
- Store embeddings in PostgreSQL

**Usage**:
1. Import workflow
2. Configure MinIO S3 credentials
3. Configure Arasul Embeddings credentials
4. Set PostgreSQL connection
5. Trigger workflow

### 3. Telemetry Reporting
**File**: `telemetry-reporting.json`

Workflow for sending custom telemetry to Dashboard API:
- Schedule trigger (every hour)
- Collect workflow execution stats
- Send to Dashboard Backend `/api/telemetry/workflow`

## HTTP Request Templates

### Dashboard API - System Status
```json
{
  "method": "GET",
  "url": "http://dashboard-backend:3001/api/system/status",
  "authentication": "headerAuth",
  "headers": {
    "Authorization": "Bearer {{$credentials.jwt}}"
  }
}
```

### Dashboard API - Report Workflow Execution
```json
{
  "method": "POST",
  "url": "http://dashboard-backend:3001/api/telemetry/workflow",
  "authentication": "headerAuth",
  "headers": {
    "Authorization": "Bearer {{$credentials.jwt}}",
    "Content-Type": "application/json"
  },
  "body": {
    "workflow_name": "{{$workflow.name}}",
    "execution_id": "{{$execution.id}}",
    "status": "{{$execution.status}}",
    "duration_ms": "{{$execution.duration}}",
    "error": "{{$execution.error}}"
  }
}
```

### MinIO - List Objects
```json
{
  "method": "GET",
  "url": "http://minio:9000/documents/",
  "authentication": "s3",
  "awsService": "s3",
  "region": "us-east-1"
}
```

### LLM Service - Direct API Call
```json
{
  "method": "POST",
  "url": "http://llm-service:11434/api/chat",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "model": "llama2",
    "messages": [
      {
        "role": "user",
        "content": "{{$json.prompt}}"
      }
    ],
    "stream": false,
    "options": {
      "temperature": 0.8,
      "num_predict": 512
    }
  }
}
```

### Embeddings Service - Generate Embedding
```json
{
  "method": "POST",
  "url": "http://embedding-service:11435/embed",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "text": "{{$json.text}}",
    "normalize": true
  }
}
```

## Credential Setup

### Arasul LLM API
1. Go to n8n UI → Credentials → Add Credential
2. Select "Arasul LLM API"
3. Configure:
   - Host: `llm-service`
   - Port: `11434`
   - Use HTTPS: `false`
   - API Key: (leave empty for internal use)

### Arasul Embeddings API
1. Go to n8n UI → Credentials → Add Credential
2. Select "Arasul Embeddings API"
3. Configure:
   - Host: `embedding-service`
   - Port: `11435`
   - Use HTTPS: `false`
   - API Key: (leave empty for internal use)

### MinIO S3
1. Go to n8n UI → Credentials → Add Credential
2. Select "AWS S3"
3. Configure:
   - Access Key ID: `${MINIO_ROOT_USER}`
   - Secret Access Key: `${MINIO_ROOT_PASSWORD}`
   - Region: `us-east-1`
   - Custom Endpoints: `true`
   - Endpoint: `http://minio:9000`
   - Force Path Style: `true`
   - SSL: `false`

Or import from `credentials/minio-s3.json`.

### Dashboard API (JWT)
1. Go to n8n UI → Credentials → Add Credential
2. Select "Header Auth"
3. Configure:
   - Name: `Authorization`
   - Value: `Bearer <your-jwt-token>`

## Workflow Execution Logging

All workflows automatically log execution data to PostgreSQL `workflow_activity` table when using the Dashboard API telemetry endpoint.

**Logged Fields**:
- `workflow_name`: Name of the workflow
- `status`: success/error
- `timestamp`: Execution start time
- `duration_ms`: Execution duration
- `error`: Error message (if failed)

**Example n8n Function Node**:
```javascript
// Log workflow execution to Dashboard API
const executionData = {
  workflow_name: $workflow.name,
  execution_id: $execution.id,
  status: $execution.mode === 'manual' ? 'success' : $execution.status,
  duration_ms: Date.now() - new Date($execution.startedAt).getTime(),
  error: $execution.error || null
};

return {
  json: executionData
};
```

Then connect to HTTP Request node targeting:
`POST http://dashboard-backend:3001/api/telemetry/workflow`

## Best Practices

1. **Use Custom Nodes**: Prefer Arasul custom nodes over direct HTTP requests for better error handling
2. **Batch Processing**: For embeddings, use batch operations (max 50 texts per batch)
3. **Error Handling**: Always enable "Continue On Fail" for robust workflows
4. **Credentials**: Never hardcode credentials - use n8n credential system
5. **Logging**: Add telemetry reporting to important workflows
6. **MinIO Paths**: Always use bucket-prefixed paths (`/documents/file.pdf`)
7. **LLM Limits**: Respect rate limits (10 req/s via Traefik)

## Troubleshooting

### LLM Node Returns Empty Response
- Check if model is loaded: `GET http://llm-service:11434/api/tags`
- Verify GPU is available: Dashboard → System → AI Services
- Check LLM service logs: `docker logs llm-service`

### Embeddings Timeout
- Reduce batch size (default: 10)
- Check embedding service health: `GET http://embedding-service:11435/health`
- Verify text length (max 512 tokens)

### MinIO Connection Failed
- Verify credentials match `.env` file
- Check MinIO is running: `docker ps | grep minio`
- Test connection: `curl http://minio:9000/minio/health/live`

### Workflow Not Logging to PostgreSQL
- Verify Dashboard Backend is reachable
- Check JWT token is valid
- Ensure `/api/telemetry/workflow` endpoint exists
- Check PostgreSQL `workflow_activity` table exists

## Support

For more information, see:
- Arasul Platform Documentation: `/docs/README.md`
- n8n Documentation: https://docs.n8n.io
- PRD Section §21: Workflow Integration
