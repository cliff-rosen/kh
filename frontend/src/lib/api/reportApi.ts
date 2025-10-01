import { api } from './index';
import { Report } from '../../types';

export const reportApi = {
    /**
     * Get all reports for a research stream
     */
    async getReportsForStream(streamId: number): Promise<Report[]> {
        const response = await api.get(`/api/reports/stream/${streamId}`);
        return response.data;
    },

    /**
     * Get the latest report for a research stream
     */
    async getLatestReportForStream(streamId: number): Promise<Report> {
        const response = await api.get(`/api/reports/stream/${streamId}/latest`);
        return response.data;
    }
};
