import React, { createContext, useContext, useState, useEffect } from 'react'
import { authApi, type LoginCredentials, type RegisterCredentials } from '../lib/api/authApi'

interface AuthContextType {
    isAuthenticated: boolean
    user: { id: string; username: string; email: string; role: string } | null

    // Auth methods
    login: (credentials: LoginCredentials) => Promise<void>
    loginWithToken: (token: string) => Promise<void>
    requestLoginToken: (email: string) => Promise<void>
    register: (credentials: RegisterCredentials) => Promise<void>
    logout: () => void

    // Loading states
    isLoginLoading: boolean
    isTokenLoginLoading: boolean
    isTokenRequestLoading: boolean
    isRegisterLoading: boolean

    // Error handling
    error: string | null
    handleSessionExpired: () => void

    // Session management
    sessionId: string | null
    sessionName: string | null
    chatId: string | null
    missionId: string | null
    sessionMetadata: Record<string, any>

    // Session methods
    updateSessionMission: (missionId: string) => Promise<void>
    updateSessionMetadata: (metadata: Record<string, any>) => Promise<void>
    switchToNewSession: (sessionData: { session_id: string; session_name: string; chat_id: string; mission_id?: string; session_metadata: Record<string, any> }) => void
    fetchActiveSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [user, setUser] = useState<{ id: string; username: string; email: string; role: string } | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Loading states
    const [isLoginLoading, setIsLoginLoading] = useState(false)
    const [isTokenLoginLoading, setIsTokenLoginLoading] = useState(false)
    const [isTokenRequestLoading, setIsTokenRequestLoading] = useState(false)
    const [isRegisterLoading, setIsRegisterLoading] = useState(false)

    // Session state
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [sessionName, setSessionName] = useState<string | null>(null)
    const [chatId, setChatId] = useState<string | null>(null)
    const [missionId, setMissionId] = useState<string | null>(null)
    const [sessionMetadata, setSessionMetadata] = useState<Record<string, any>>({})

    useEffect(() => {
        const token = localStorage.getItem('authToken')
        const userData = localStorage.getItem('user')
        if (token && userData) {
            setIsAuthenticated(true)
            setUser(JSON.parse(userData))

            // Restore session data from localStorage if available
            const sessionData = localStorage.getItem('sessionData')
            if (sessionData) {
                try {
                    const parsed = JSON.parse(sessionData)
                    setSessionId(parsed.sessionId)
                    setSessionName(parsed.sessionName)
                    setChatId(parsed.chatId)
                    setMissionId(parsed.missionId)
                    setSessionMetadata(parsed.sessionMetadata || {})
                    console.log('Restored session data from localStorage:', parsed)
                } catch (error) {
                    console.error('Error parsing session data from localStorage:', error)
                }
            }

            // Also try to fetch active session from backend in case data changed
            fetchActiveSession()
        }
    }, [])

    const extractErrorMessage = (error: any, defaultMessage: string): string => {
        if (error.response?.data) {
            // Handle FastAPI validation errors
            if (error.response.data.detail && Array.isArray(error.response.data.detail)) {
                // FastAPI validation errors with detail array
                const validationErrors = error.response.data.detail.map((err: any) => err.msg).join(', ')
                return validationErrors
            } else if (Array.isArray(error.response.data)) {
                // Direct array of validation errors
                const validationErrors = error.response.data.map((err: any) => err.msg).join(', ')
                return validationErrors
            } else if (error.response.data.detail) {
                return error.response.data.detail
            } else if (error.response.data.message) {
                return error.response.data.message
            } else if (typeof error.response.data === 'string') {
                return error.response.data
            }
        } else if (error.message) {
            return error.message
        }
        return defaultMessage
    }

    const handleAuthSuccess = (data: any) => {
        setError(null)
        localStorage.setItem('authToken', data.access_token)
        localStorage.setItem('user', JSON.stringify({
            id: data.user_id,
            username: data.username,
            email: data.email,
            role: data.role
        }))
        setUser({
            id: data.user_id,
            username: data.username,
            email: data.email,
            role: data.role
        })

        // Set session information directly from login response
        setSessionId(data.session_id)
        setSessionName(data.session_name)
        setChatId(data.chat_id)
        setMissionId(data.mission_id)
        setSessionMetadata(data.session_metadata || {})

        // Save session data to localStorage
        localStorage.setItem('sessionData', JSON.stringify({
            sessionId: data.session_id,
            sessionName: data.session_name,
            chatId: data.chat_id,
            missionId: data.mission_id,
            sessionMetadata: data.session_metadata || {}
        }))

        setIsAuthenticated(true)
    }

    const fetchActiveSession = async () => {
        try {
            const sessionData = await authApi.getActiveSession()

            setSessionId(sessionData.id)
            setSessionName(sessionData.name)
            setChatId(sessionData.chat_id)
            setMissionId(sessionData.mission_id)
            setSessionMetadata(sessionData.session_metadata || {})

            // Update localStorage with fresh data
            localStorage.setItem('sessionData', JSON.stringify({
                sessionId: sessionData.id,
                sessionName: sessionData.name,
                chatId: sessionData.chat_id,
                missionId: sessionData.mission_id,
                sessionMetadata: sessionData.session_metadata || {}
            }))

            console.log('Fetched and restored active session from backend:', sessionData)
        } catch (error) {
            console.error('Error fetching active session:', error)
            // If no active session exists, that's okay - user might need to create one
        }
    }

    const login = async (credentials: LoginCredentials): Promise<void> => {
        try {
            setIsLoginLoading(true)
            setError(null)

            const authResponse = await authApi.login(credentials)
            handleAuthSuccess(authResponse)
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Login failed. Please try again.')
            setError(errorMessage)
            throw error
        } finally {
            setIsLoginLoading(false)
        }
    }

    const loginWithToken = async (token: string): Promise<void> => {
        try {
            setIsTokenLoginLoading(true)
            setError(null)

            const authResponse = await authApi.loginWithToken(token)
            handleAuthSuccess(authResponse)
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Token login failed. The token may be invalid or expired.')
            setError(errorMessage)
            throw error
        } finally {
            setIsTokenLoginLoading(false)
        }
    }

    const requestLoginToken = async (email: string): Promise<void> => {
        try {
            setIsTokenRequestLoading(true)
            setError(null)

            const response = await authApi.requestLoginToken(email)
            // Set the backend's message as a success message
            setError(response.message)
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Failed to send login token. Please try again.')
            setError(errorMessage)
            throw error
        } finally {
            setIsTokenRequestLoading(false)
        }
    }

    const register = async (credentials: RegisterCredentials): Promise<void> => {
        try {
            setIsRegisterLoading(true)
            setError(null)

            const authResponse = await authApi.register(credentials)
            // Registration now returns Token response and automatically logs user in
            handleAuthSuccess(authResponse)
            setError(null)
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Registration failed. Please try again.')
            setError(errorMessage)
            throw error
        } finally {
            setIsRegisterLoading(false)
        }
    }

    // Session management functions
    const updateSessionMission = async (newMissionId: string) => {
        if (!sessionId) return

        try {
            const response = await authApi.updateSessionMission(sessionId, newMissionId)
            setMissionId(response.mission_id)

            // Update localStorage with new mission_id
            localStorage.setItem('sessionData', JSON.stringify({
                sessionId: sessionId,
                sessionName: sessionName,
                chatId: chatId,
                missionId: response.mission_id,
                sessionMetadata: sessionMetadata
            }))
        } catch (error) {
            console.error('Error updating session mission:', error)
            throw error
        }
    }

    const updateSessionMetadata = async (metadata: Record<string, any>) => {
        if (!sessionId) return

        try {
            const updatedMetadata = { ...sessionMetadata, ...metadata }
            const response = await authApi.updateSessionMetadata(sessionId, updatedMetadata)
            setSessionMetadata(response.session_metadata)

            // Update localStorage with new metadata
            localStorage.setItem('sessionData', JSON.stringify({
                sessionId: sessionId,
                sessionName: sessionName,
                chatId: chatId,
                missionId: missionId,
                sessionMetadata: response.session_metadata
            }))
        } catch (error) {
            console.error('Error updating session metadata:', error)
            // Don't throw - metadata updates shouldn't break the app
        }
    }

    const switchToNewSession = (sessionData: { session_id: string; session_name: string; chat_id: string; mission_id?: string; session_metadata: Record<string, any> }) => {
        setSessionId(sessionData.session_id)
        setSessionName(sessionData.session_name)
        setChatId(sessionData.chat_id)
        setMissionId(sessionData.mission_id || null)
        setSessionMetadata(sessionData.session_metadata)

        // Save session data to localStorage
        localStorage.setItem('sessionData', JSON.stringify({
            sessionId: sessionData.session_id,
            sessionName: sessionData.session_name,
            chatId: sessionData.chat_id,
            missionId: sessionData.mission_id || null,
            sessionMetadata: sessionData.session_metadata
        }))
    }

    const logout = () => {
        localStorage.removeItem('authToken')
        localStorage.removeItem('user')
        localStorage.removeItem('sessionData')
        setIsAuthenticated(false)
        setUser(null)

        // Clear session data
        setSessionId(null)
        setSessionName(null)
        setChatId(null)
        setMissionId(null)
        setSessionMetadata({})
    }

    const handleSessionExpired = () => {
        logout()
        setError('Your session has expired. Please login again.')
    }

    return (
        <AuthContext.Provider value={{
            isAuthenticated,
            user,

            // Auth methods
            login,
            loginWithToken,
            requestLoginToken,
            register,
            logout,

            // Loading states
            isLoginLoading,
            isTokenLoginLoading,
            isTokenRequestLoading,
            isRegisterLoading,

            // Error handling
            error,
            handleSessionExpired,

            // Session management
            sessionId,
            sessionName,
            chatId,
            missionId,
            sessionMetadata,

            // Session methods
            updateSessionMission,
            updateSessionMetadata,
            switchToNewSession,
            fetchActiveSession
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
} 