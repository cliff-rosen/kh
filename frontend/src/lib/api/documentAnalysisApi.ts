import { api } from './index';
import {
    DocumentAnalysisRequest,
    DocumentAnalysisResult
} from '../../types/document_analysis';

export const documentAnalysisApi = {
    /**
     * Analyze a document with AI-powered extraction
     */
    async analyzeDocument(request: DocumentAnalysisRequest): Promise<DocumentAnalysisResult> {
        const response = await api.post('/api/tools/document-analysis/analyze', request);
        return response.data;
    },

    /**
     * Health check for document analysis service
     */
    async healthCheck(): Promise<{ status: string; service: string }> {
        const response = await api.get('/api/tools/document-analysis/health');
        return response.data;
    }
};
