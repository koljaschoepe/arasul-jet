import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
} from 'n8n-workflow';

import axios from 'axios';
import FormData from 'form-data';

export class ArasulDocuments implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Arasul Documents',
        name: 'arasulDocuments',
        icon: 'file:arasul.svg',
        group: ['transform'],
        version: 1,
        subtitle: '={{$parameter["operation"]}}',
        description: 'Extract text and analyze documents via Arasul (OCR, PDF, DOCX)',
        defaults: {
            name: 'Arasul Documents',
        },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [
            {
                name: 'arasulDocumentsApi',
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
                        name: 'Extract Text',
                        value: 'extract',
                        description: 'Extract text from a document (OCR if needed)',
                        action: 'Extract text from a document',
                    },
                    {
                        name: 'Analyze',
                        value: 'analyze',
                        description: 'Extract text and analyze with AI',
                        action: 'Analyze a document with AI',
                    },
                    {
                        name: 'Extract Structured',
                        value: 'extractStructured',
                        description: 'Extract structured JSON data from a document',
                        action: 'Extract structured data from a document',
                    },
                ],
                default: 'extract',
            },
            // Input mode: binary data or file path
            {
                displayName: 'Input',
                name: 'inputMode',
                type: 'options',
                options: [
                    {
                        name: 'Binary Data',
                        value: 'binary',
                        description: 'Use binary data from a previous node (e.g. email attachment)',
                    },
                    {
                        name: 'File Path',
                        value: 'filePath',
                        description: 'Read a file from a local path',
                    },
                ],
                default: 'binary',
            },
            {
                displayName: 'Binary Property',
                name: 'binaryProperty',
                type: 'string',
                displayOptions: {
                    show: {
                        inputMode: ['binary'],
                    },
                },
                default: 'data',
                description: 'Name of the binary property containing the file',
                required: true,
            },
            {
                displayName: 'File Path',
                name: 'filePath',
                type: 'string',
                displayOptions: {
                    show: {
                        inputMode: ['filePath'],
                    },
                },
                default: '',
                description: 'Path to the file on the server',
                required: true,
            },
            // Analyze options
            {
                displayName: 'Prompt',
                name: 'prompt',
                type: 'string',
                typeOptions: {
                    rows: 4,
                },
                displayOptions: {
                    show: {
                        operation: ['analyze'],
                    },
                },
                default: '',
                description: 'What to do with the document. Leave empty for a general summary.',
            },
            {
                displayName: 'Model',
                name: 'model',
                type: 'string',
                displayOptions: {
                    show: {
                        operation: ['analyze', 'extractStructured'],
                    },
                },
                default: '',
                description: 'LLM model to use (leave empty for default)',
            },
            // Structured extraction options
            {
                displayName: 'Schema',
                name: 'schema',
                type: 'json',
                displayOptions: {
                    show: {
                        operation: ['extractStructured'],
                    },
                },
                default: '{\n  "invoice_number": "",\n  "date": "",\n  "total": 0,\n  "vendor": "",\n  "items": []\n}',
                description: 'JSON schema describing the desired output structure',
                required: true,
            },
            {
                displayName: 'Instructions',
                name: 'instructions',
                type: 'string',
                typeOptions: {
                    rows: 3,
                },
                displayOptions: {
                    show: {
                        operation: ['extractStructured'],
                    },
                },
                default: '',
                description: 'Additional instructions for structured extraction',
            },
            // Common options
            {
                displayName: 'Timeout (Seconds)',
                name: 'timeoutSeconds',
                type: 'number',
                displayOptions: {
                    show: {
                        operation: ['analyze', 'extractStructured'],
                    },
                },
                default: 300,
                description: 'Maximum wait time for AI processing',
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        const credentials = await this.getCredentials('arasulDocumentsApi');
        const baseUrl = credentials.baseUrl as string;
        const apiKey = credentials.apiKey as string;

        for (let i = 0; i < items.length; i++) {
            try {
                const operation = this.getNodeParameter('operation', i) as string;
                const inputMode = this.getNodeParameter('inputMode', i) as string;

                // Get file buffer and filename
                let fileBuffer: Buffer;
                let fileName: string;

                if (inputMode === 'binary') {
                    const binaryProperty = this.getNodeParameter('binaryProperty', i) as string;
                    const binaryData = this.helpers.assertBinaryData(i, binaryProperty);

                    if (binaryData.id) {
                        fileBuffer = await this.helpers.binaryToBuffer(
                            await this.helpers.getBinaryStream(binaryData.id),
                        );
                    } else if (binaryData.data) {
                        fileBuffer = Buffer.from(binaryData.data, 'base64');
                    } else {
                        throw new NodeOperationError(
                            this.getNode(),
                            `No binary data found in property "${binaryProperty}"`,
                            { itemIndex: i },
                        );
                    }
                    fileName = binaryData.fileName || 'document';
                } else {
                    const filePath = this.getNodeParameter('filePath', i) as string;
                    const fs = require('fs');
                    fileBuffer = fs.readFileSync(filePath);
                    fileName = filePath.split('/').pop() || 'document';
                }

                // Build FormData
                const formData = new FormData();
                formData.append('file', fileBuffer, { filename: fileName });

                let endpoint: string;
                let responseData: any;

                if (operation === 'extract') {
                    endpoint = `${baseUrl}/document/extract`;
                } else if (operation === 'analyze') {
                    endpoint = `${baseUrl}/document/analyze`;
                    const prompt = this.getNodeParameter('prompt', i, '') as string;
                    const model = this.getNodeParameter('model', i, '') as string;
                    const timeoutSeconds = this.getNodeParameter('timeoutSeconds', i, 300) as number;

                    if (prompt) formData.append('prompt', prompt);
                    if (model) formData.append('model', model);
                    formData.append('timeout_seconds', String(timeoutSeconds));
                } else if (operation === 'extractStructured') {
                    endpoint = `${baseUrl}/document/extract-structured`;
                    const schema = this.getNodeParameter('schema', i) as string;
                    const instructions = this.getNodeParameter('instructions', i, '') as string;
                    const model = this.getNodeParameter('model', i, '') as string;
                    const timeoutSeconds = this.getNodeParameter('timeoutSeconds', i, 300) as number;

                    formData.append('schema', typeof schema === 'string' ? schema : JSON.stringify(schema));
                    if (instructions) formData.append('instructions', instructions);
                    if (model) formData.append('model', model);
                    formData.append('timeout_seconds', String(timeoutSeconds));
                } else {
                    throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
                }

                const response = await axios.post(endpoint!, formData, {
                    headers: {
                        ...formData.getHeaders(),
                        'X-API-Key': apiKey,
                    },
                    timeout: 600000, // 10 min max
                    maxBodyLength: 50 * 1024 * 1024,
                });

                responseData = response.data;

                returnData.push({
                    json: responseData,
                    pairedItem: { item: i },
                });
            } catch (error: any) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: error.message,
                            details: error.response?.data || null,
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
