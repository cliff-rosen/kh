import { api } from './index';
import { Mission, MissionStatus } from '@/types/workflow';

export interface CreateMissionResponse {
    mission_id: string;
}

export interface MissionApiResponse {
    message: string;
}

export interface MissionWithHopsResponse {
    mission: Mission;
    hops: any[]; // Will be typed properly when hop types are ready
}

export interface MissionStatusUpdate {
    status: MissionStatus;
}

export const missionApi = {
    /**
     * Create a new mission
     */
    async createMission(mission: Mission): Promise<CreateMissionResponse> {
        const response = await api.post<CreateMissionResponse>('/api/missions/', mission);
        return response.data;
    },

    /**
     * Get a mission by ID
     */
    async getMission(missionId: string): Promise<Mission> {
        const response = await api.get<Mission>(`/api/missions/${missionId}`);
        return response.data;
    },

    /**
     * Get a mission with its hops and tool steps
     */
    async getMissionWithHops(missionId: string): Promise<MissionWithHopsResponse> {
        const response = await api.get<MissionWithHopsResponse>(`/api/missions/${missionId}/full`);
        return response.data;
    },

    /**
     * Update an existing mission
     */
    async updateMission(missionId: string, mission: Mission): Promise<MissionApiResponse> {
        const response = await api.put<MissionApiResponse>(`/api/missions/${missionId}`, mission);
        return response.data;
    },

    /**
     * Update mission status only
     */
    async updateMissionStatus(missionId: string, status: MissionStatus): Promise<MissionApiResponse> {
        const response = await api.patch<MissionApiResponse>(`/api/missions/${missionId}/status`, { status });
        return response.data;
    },

    /**
     * Delete a mission
     */
    async deleteMission(missionId: string): Promise<MissionApiResponse> {
        const response = await api.delete<MissionApiResponse>(`/api/missions/${missionId}`);
        return response.data;
    },

    /**
     * Get all missions for the current user
     */
    async getUserMissions(): Promise<Mission[]> {
        const response = await api.get<Mission[]>('/api/missions/');
        return response.data;
    },
}; 