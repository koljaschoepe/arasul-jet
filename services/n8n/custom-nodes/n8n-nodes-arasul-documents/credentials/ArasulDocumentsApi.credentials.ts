import {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
} from 'n8n-workflow';

export class ArasulDocumentsApi implements ICredentialType {
    name = 'arasulDocumentsApi';
    displayName = 'Arasul Documents API';
    documentationUrl = 'https://arasul.local/docs/document-api';
    properties: INodeProperties[] = [
        {
            displayName: 'API Base URL',
            name: 'baseUrl',
            type: 'string',
            default: 'http://dashboard-backend:3001/api/v1/external',
            description: 'Base URL of the Arasul External API',
            required: true,
        },
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: {
                password: true,
            },
            default: '',
            description: 'API Key from Arasul Settings > API Keys',
            required: true,
        },
    ];

    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            headers: {
                'X-API-Key': '={{$credentials.apiKey}}',
            },
        },
    };

    test: ICredentialTestRequest = {
        request: {
            baseURL: '={{$credentials.baseUrl}}',
            url: '/models',
            method: 'GET',
        },
    };
}
