import { api } from './index';
import { Report, ReportWithArticles } from '../../types';

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
    },

    /**
     * Get a report with its articles
     */
    async getReportWithArticles(reportId: number): Promise<ReportWithArticles> {
        const response = await api.get(`/api/reports/${reportId}`);
        return response.data;
    },

    /**
     * Get pipeline analytics for a test report
     */
    async getPipelineAnalytics(reportId: number): Promise<any> {
        const response = await api.get(`/api/reports/${reportId}/pipeline-analytics`);
        return response.data;
    }
};
