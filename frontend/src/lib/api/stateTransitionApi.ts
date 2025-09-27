import { api } from './index';

export interface StateTransitionResponse {
    success: boolean;
    entity_id: string;
    status: string;
    message: string;
    metadata: Record<string, any>;
}

export interface StateTransitionRequest {
    transaction_type: string;
    data: Record<string, any>;
}

export const stateTransitionApi = {
    /**
     * Execute a generic state transition
     */
    async executeStateTransition(request: StateTransitionRequest): Promise<StateTransitionResponse> {
        const response = await api.post<StateTransitionResponse>('/api/state-transitions/execute', request);
        return response.data;
    },

    /**
     * Accept a mission proposal (step 1.2)
     */
    async acceptMission(missionId: string): Promise<StateTransitionResponse> {
        const response = await api.post<StateTransitionResponse>(`/api/state-transitions/accept-mission/${missionId}`);
        return response.data;
    },

    /**
     * Accept a hop plan proposal (steps 2.3, 3.3)
     */
    async acceptHopPlan(hopId: string): Promise<StateTransitionResponse> {
        const response = await api.post<StateTransitionResponse>(`/api/state-transitions/accept-hop-plan/${hopId}`);
        return response.data;
    },

    /**
     * Accept a hop implementation proposal (steps 2.6, 3.6)
     */
    async acceptHopImplementation(hopId: string): Promise<StateTransitionResponse> {
        const response = await api.post<StateTransitionResponse>(`/api/state-transitions/accept-hop-implementation/${hopId}`);
        return response.data;
    },

    /**
     * Execute a hop (steps 2.7, 3.7)
     */
    async executeHop(hopId: string): Promise<StateTransitionResponse> {
        const response = await api.post<StateTransitionResponse>(`/api/state-transitions/execute-hop/${hopId}`);
        return response.data;
    },

    /**
     * Complete a hop (steps 2.8, 3.8)
     */
    async completeHop(hopId: string): Promise<StateTransitionResponse> {
        const response = await api.post<StateTransitionResponse>(`/api/state-transitions/complete-hop/${hopId}`);
        return response.data;
    },
};