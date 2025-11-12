import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
} from 'n8n-workflow';

import axios, { AxiosRequestConfig } from 'axios';

export class ArasulEmbeddings implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Arasul Embeddings',
        name: 'arasulEmbeddings',
        icon: 'file:arasul.svg',
        group: ['transform'],
        version: 1,
        subtitle: '={{$parameter["operation"]}}',
        description: 'Generate embeddings using Arasul Embeddings Service',
        defaults: {
            name: 'Arasul Embeddings',
        },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [
            {
                name: 'arasulEmbeddingsApi',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                options: [
                    {
                        name: 'Generate Embedding',
                        value: 'generateEmbedding',
                        description: 'Generate embedding for text',
                        action: 'Generate embedding for text',
                    },
                    {
                        name: 'Batch Generate',
                        value: 'batchGenerate',
                        description: 'Generate embeddings for multiple texts',
                        action: 'Generate embeddings for multiple texts',
                    },
                    {
                        name: 'Get Model Info',
                        value: 'getModelInfo',
                        description: 'Get embedding model information',
                        action: 'Get embedding model information',
                    },
                ],
                default: 'generateEmbedding',
            },
            // Generate Embedding
            {
                displayName: 'Text',
                name: 'text',
                type: 'string',
                typeOptions: {
                    rows: 4,
                },
                displayOptions: {
                    show: {
                        operation: ['generateEmbedding'],
                    },
                },
                default: '',
                description: 'The text to generate embedding for',
                required: true,
            },
            {
                displayName: 'Normalize',
                name: 'normalize',
                type: 'boolean',
                displayOptions: {
                    show: {
                        operation: ['generateEmbedding'],
                    },
                },
                default: true,
                description: 'Whether to normalize the embedding vector',
            },
            // Batch Generate
            {
                displayName: 'Texts',
                name: 'texts',
                type: 'string',
                typeOptions: {
                    rows: 8,
                },
                displayOptions: {
                    show: {
                        operation: ['batchGenerate'],
                    },
                },
                default: '',
                description: 'Texts to generate embeddings for (one per line)',
                required: true,
            },
            {
                displayName: 'Batch Size',
                name: 'batchSize',
                type: 'number',
                displayOptions: {
                    show: {
                        operation: ['batchGenerate'],
                    },
                },
                default: 10,
                description: 'Number of texts to process in each batch',
            },
            {
                displayName: 'Include Metadata',
                name: 'includeMetadata',
                type: 'boolean',
                displayOptions: {
                    show: {
                        operation: ['generateEmbedding', 'batchGenerate'],
                    },
                },
                default: false,
                description: 'Whether to include metadata (model name, vector size, processing time)',
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        const credentials = await this.getCredentials('arasulEmbeddingsApi');
        const baseURL = `${credentials.ssl ? 'https' : 'http'}://${credentials.host}:${credentials.port}`;

        for (let i = 0; i < items.length; i++) {
            try {
                const operation = this.getNodeParameter('operation', i) as string;

                let responseData: any;

                if (operation === 'generateEmbedding') {
                    const text = this.getNodeParameter('text', i) as string;
                    const normalize = this.getNodeParameter('normalize', i, true) as boolean;
                    const includeMetadata = this.getNodeParameter('includeMetadata', i, false) as boolean;

                    const requestConfig: AxiosRequestConfig = {
                        method: 'POST',
                        url: `${baseURL}/embed`,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        data: {
                            text,
                            normalize,
                        },
                    };

                    if (credentials.apiKey) {
                        requestConfig.headers!['Authorization'] = `Bearer ${credentials.apiKey}`;
                    }

                    const response = await axios(requestConfig);

                    if (includeMetadata) {
                        responseData = response.data;
                    } else {
                        responseData = {
                            embedding: response.data.embedding,
                        };
                    }

                } else if (operation === 'batchGenerate') {
                    const textsInput = this.getNodeParameter('texts', i) as string;
                    const batchSize = this.getNodeParameter('batchSize', i, 10) as number;
                    const includeMetadata = this.getNodeParameter('includeMetadata', i, false) as boolean;

                    const texts = textsInput.split('\n').filter(t => t.trim().length > 0);

                    if (texts.length === 0) {
                        throw new NodeOperationError(this.getNode(), 'No valid texts provided', { itemIndex: i });
                    }

                    const embeddings = [];

                    // Process in batches
                    for (let j = 0; j < texts.length; j += batchSize) {
                        const batch = texts.slice(j, j + batchSize);

                        const batchPromises = batch.map(text => {
                            const requestConfig: AxiosRequestConfig = {
                                method: 'POST',
                                url: `${baseURL}/embed`,
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                data: {
                                    text,
                                    normalize: true,
                                },
                            };

                            if (credentials.apiKey) {
                                requestConfig.headers!['Authorization'] = `Bearer ${credentials.apiKey}`;
                            }

                            return axios(requestConfig);
                        });

                        const batchResults = await Promise.all(batchPromises);

                        for (const result of batchResults) {
                            if (includeMetadata) {
                                embeddings.push(result.data);
                            } else {
                                embeddings.push({ embedding: result.data.embedding });
                            }
                        }
                    }

                    responseData = {
                        count: embeddings.length,
                        embeddings,
                    };

                } else if (operation === 'getModelInfo') {
                    const requestConfig: AxiosRequestConfig = {
                        method: 'GET',
                        url: `${baseURL}/health`,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    };

                    if (credentials.apiKey) {
                        requestConfig.headers!['Authorization'] = `Bearer ${credentials.apiKey}`;
                    }

                    const response = await axios(requestConfig);
                    responseData = response.data;
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
