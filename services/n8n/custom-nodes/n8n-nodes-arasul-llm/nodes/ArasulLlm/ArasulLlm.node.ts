import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
} from 'n8n-workflow';

import axios, { AxiosRequestConfig } from 'axios';

export class ArasulLlm implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Arasul LLM',
        name: 'arasulLlm',
        icon: 'file:arasul.svg',
        group: ['transform'],
        version: 1,
        subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
        description: 'Interact with Arasul LLM Service (Ollama)',
        defaults: {
            name: 'Arasul LLM',
        },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [
            {
                name: 'arasulLlmApi',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Resource',
                name: 'resource',
                type: 'options',
                noDataExpression: true,
                options: [
                    {
                        name: 'Chat',
                        value: 'chat',
                    },
                    {
                        name: 'Generate',
                        value: 'generate',
                    },
                    {
                        name: 'Model',
                        value: 'model',
                    },
                ],
                default: 'chat',
            },
            // Chat Operations
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: ['chat'],
                    },
                },
                options: [
                    {
                        name: 'Send Message',
                        value: 'sendMessage',
                        description: 'Send a chat message',
                        action: 'Send a chat message',
                    },
                ],
                default: 'sendMessage',
            },
            {
                displayName: 'Model Name',
                name: 'model',
                type: 'string',
                displayOptions: {
                    show: {
                        resource: ['chat'],
                        operation: ['sendMessage'],
                    },
                },
                default: 'llama2',
                description: 'The model to use for chat',
                required: true,
            },
            {
                displayName: 'Message',
                name: 'message',
                type: 'string',
                typeOptions: {
                    rows: 4,
                },
                displayOptions: {
                    show: {
                        resource: ['chat'],
                        operation: ['sendMessage'],
                    },
                },
                default: '',
                description: 'The message to send',
                required: true,
            },
            {
                displayName: 'System Prompt',
                name: 'systemPrompt',
                type: 'string',
                typeOptions: {
                    rows: 2,
                },
                displayOptions: {
                    show: {
                        resource: ['chat'],
                        operation: ['sendMessage'],
                    },
                },
                default: '',
                description: 'System prompt to guide the model behavior',
            },
            {
                displayName: 'Temperature',
                name: 'temperature',
                type: 'number',
                typeOptions: {
                    minValue: 0,
                    maxValue: 2,
                    numberPrecision: 2,
                },
                displayOptions: {
                    show: {
                        resource: ['chat'],
                        operation: ['sendMessage'],
                    },
                },
                default: 0.8,
                description: 'Sampling temperature (0-2)',
            },
            {
                displayName: 'Max Tokens',
                name: 'maxTokens',
                type: 'number',
                displayOptions: {
                    show: {
                        resource: ['chat'],
                        operation: ['sendMessage'],
                    },
                },
                default: 512,
                description: 'Maximum number of tokens to generate',
            },
            // Generate Operations
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: ['generate'],
                    },
                },
                options: [
                    {
                        name: 'Generate Completion',
                        value: 'generateCompletion',
                        description: 'Generate a text completion',
                        action: 'Generate a text completion',
                    },
                ],
                default: 'generateCompletion',
            },
            {
                displayName: 'Model Name',
                name: 'model',
                type: 'string',
                displayOptions: {
                    show: {
                        resource: ['generate'],
                        operation: ['generateCompletion'],
                    },
                },
                default: 'llama2',
                description: 'The model to use',
                required: true,
            },
            {
                displayName: 'Prompt',
                name: 'prompt',
                type: 'string',
                typeOptions: {
                    rows: 4,
                },
                displayOptions: {
                    show: {
                        resource: ['generate'],
                        operation: ['generateCompletion'],
                    },
                },
                default: '',
                description: 'The prompt to generate from',
                required: true,
            },
            {
                displayName: 'Stream Response',
                name: 'stream',
                type: 'boolean',
                displayOptions: {
                    show: {
                        resource: ['generate'],
                        operation: ['generateCompletion'],
                    },
                },
                default: false,
                description: 'Whether to stream the response',
            },
            // Model Operations
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                displayOptions: {
                    show: {
                        resource: ['model'],
                    },
                },
                options: [
                    {
                        name: 'List Models',
                        value: 'listModels',
                        description: 'List available models',
                        action: 'List available models',
                    },
                    {
                        name: 'Show Model Info',
                        value: 'showModelInfo',
                        description: 'Show model information',
                        action: 'Show model information',
                    },
                ],
                default: 'listModels',
            },
            {
                displayName: 'Model Name',
                name: 'model',
                type: 'string',
                displayOptions: {
                    show: {
                        resource: ['model'],
                        operation: ['showModelInfo'],
                    },
                },
                default: 'llama2',
                description: 'The model name',
                required: true,
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        const credentials = await this.getCredentials('arasulLlmApi');
        const baseURL = `${credentials.ssl ? 'https' : 'http'}://${credentials.host}:${credentials.port}`;

        for (let i = 0; i < items.length; i++) {
            try {
                const resource = this.getNodeParameter('resource', i) as string;
                const operation = this.getNodeParameter('operation', i) as string;

                let responseData: any;

                if (resource === 'chat') {
                    if (operation === 'sendMessage') {
                        const model = this.getNodeParameter('model', i) as string;
                        const message = this.getNodeParameter('message', i) as string;
                        const systemPrompt = this.getNodeParameter('systemPrompt', i, '') as string;
                        const temperature = this.getNodeParameter('temperature', i, 0.8) as number;
                        const maxTokens = this.getNodeParameter('maxTokens', i, 512) as number;

                        const messages = [];
                        if (systemPrompt) {
                            messages.push({ role: 'system', content: systemPrompt });
                        }
                        messages.push({ role: 'user', content: message });

                        const requestConfig: AxiosRequestConfig = {
                            method: 'POST',
                            url: `${baseURL}/api/chat`,
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            data: {
                                model,
                                messages,
                                stream: false,
                                options: {
                                    temperature,
                                    num_predict: maxTokens,
                                },
                            },
                        };

                        if (credentials.apiKey) {
                            requestConfig.headers!['Authorization'] = `Bearer ${credentials.apiKey}`;
                        }

                        const response = await axios(requestConfig);
                        responseData = response.data;
                    }
                } else if (resource === 'generate') {
                    if (operation === 'generateCompletion') {
                        const model = this.getNodeParameter('model', i) as string;
                        const prompt = this.getNodeParameter('prompt', i) as string;
                        const stream = this.getNodeParameter('stream', i, false) as boolean;

                        const requestConfig: AxiosRequestConfig = {
                            method: 'POST',
                            url: `${baseURL}/api/generate`,
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            data: {
                                model,
                                prompt,
                                stream,
                            },
                        };

                        if (credentials.apiKey) {
                            requestConfig.headers!['Authorization'] = `Bearer ${credentials.apiKey}`;
                        }

                        const response = await axios(requestConfig);
                        responseData = response.data;
                    }
                } else if (resource === 'model') {
                    if (operation === 'listModels') {
                        const requestConfig: AxiosRequestConfig = {
                            method: 'GET',
                            url: `${baseURL}/api/tags`,
                            headers: {
                                'Content-Type': 'application/json',
                            },
                        };

                        if (credentials.apiKey) {
                            requestConfig.headers!['Authorization'] = `Bearer ${credentials.apiKey}`;
                        }

                        const response = await axios(requestConfig);
                        responseData = response.data;
                    } else if (operation === 'showModelInfo') {
                        const model = this.getNodeParameter('model', i) as string;

                        const requestConfig: AxiosRequestConfig = {
                            method: 'POST',
                            url: `${baseURL}/api/show`,
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            data: {
                                name: model,
                            },
                        };

                        if (credentials.apiKey) {
                            requestConfig.headers!['Authorization'] = `Bearer ${credentials.apiKey}`;
                        }

                        const response = await axios(requestConfig);
                        responseData = response.data;
                    }
                }

                returnData.push({
                    json: responseData,
                    pairedItem: { item: i },
                });
            } catch (error: any) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: error.message,
                        },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                throw new NodeOperationError(this.getNode(), error.message, { itemIndex: i });
            }
        }

        return [returnData];
    }
}
