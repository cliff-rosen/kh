import { ModelData } from '../types/models';
import { api } from './index';

export const modelApi = {
    getModels: async (): Promise<ModelData> => {
        const response = await api.get('/api/llm/models');
        return response.data;
    }
}; 