import {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

export class ArasulEmbeddingsApi implements ICredentialType {
    name = 'arasulEmbeddingsApi';
    displayName = 'Arasul Embeddings API';
    documentationUrl = 'https://arasul.local/docs/embeddings-api';
    properties: INodeProperties[] = [
        {
            displayName: 'Host',
            name: 'host',
            type: 'string',
            default: 'embedding-service',
            description: 'Hostname of the Arasul Embeddings service',
            required: true,
        },
        {
            displayName: 'Port',
            name: 'port',
            type: 'number',
            default: 11435,
            description: 'Port of the Arasul Embeddings service',
            required: true,
        },
        {
            displayName: 'Use HTTPS',
            name: 'ssl',
            type: 'boolean',
            default: false,
            description: 'Whether to use HTTPS',
        },
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: {
                password: true,
            },
            default: '',
            description: 'API Key for authentication (optional for internal use)',
        },
    ];

    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            headers: {
                'Authorization': '={{$credentials.apiKey ? "Bearer " + $credentials.apiKey : ""}}',
            },
        },
    };

    test: ICredentialTestRequest = {
        request: {
            baseURL: '={{$credentials.ssl ? "https" : "http"}}://{{$credentials.host}}:{{$credentials.port}}',
            url: '/health',
            method: 'GET',
        },
    };
}
