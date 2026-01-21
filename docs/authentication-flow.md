# Authentication Flow

This document describes how authentication works end-to-end, covering token acquisition and route protection.

---

## Flow 1: User Authenticates to Get a Token

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LoginPage                                                                   │
│      │                                                                       │
│      ▼                                                                       │
│  AuthContext.login(credentials)                                              │
│      │                                                                       │
│      ▼                                                                       │
│  authApi.login() ──── POST /api/auth/login ────────────────────────────────┼──┐
│      │                                                                       │  │
│      ▼                                                                       │  │
│  handleAuthSuccess(response)                                                 │  │
│      │                                                                       │  │
│      ├── setAuthToken(access_token)  ──► localStorage['authToken']           │  │
│      ├── setUserData(user)           ──► localStorage['user']                │  │
│      └── setIsAuthenticated(true)    ──► triggers route change               │  │
│                                                                              │  │
└─────────────────────────────────────────────────────────────────────────────┘  │
                                                                                  │
┌─────────────────────────────────────────────────────────────────────────────┐  │
│                              BACKEND                                         │  │
├─────────────────────────────────────────────────────────────────────────────┤  │
│                                                                              │  │
│  POST /api/auth/login  ◄────────────────────────────────────────────────────┼──┘
│      │                                                 (routers/auth.py:129)
│      ▼
│  auth_service.login_user(db, email, password)          (auth_service.py:122)
│      │
│      ▼
│  user_service.verify_credentials(email, password)
│      │
│      ├── get_user_by_email()
│      └── verify_password() (bcrypt)
│      │
│      ▼
│  _create_token_for_user(user)                          (auth_service.py:89)
│      │
│      ▼
│  create_access_token(token_data)                       (auth_service.py:60)
│      │
│      ├── payload: { sub, user_id, org_id, username, role, iat, exp }
│      └── jwt.encode(payload, SECRET_KEY, HS256)
│      │
│      ▼
│  Return Token { access_token, token_type, username, role, user_id, ... }
│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 2: Token Protects Routes

### Frontend Protection (React Level)

```
App.tsx
    │
    ▼
AppContent()
    │
    ├── useAuth() → { isAuthenticated }
    │
    ▼
┌─────────────────────────────────────┐
│  isAuthenticated === false ?        │
│      │                              │
│      ├── YES → Show: LoginPage,     │
│      │         TokenLogin,          │
│      │         ResetPassword        │
│      │                              │
│      └── NO  → Show: AuthenticatedApp│
│                (Dashboard, Streams,  │
│                 Reports, etc.)       │
└─────────────────────────────────────┘
```

### Frontend Protection (API Level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  api/index.ts - Axios Interceptors                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  REQUEST INTERCEPTOR (line 74-80)                                            │
│      │                                                                       │
│      ├── getAuthToken() from localStorage                                    │
│      └── Add header: Authorization: Bearer {token}                           │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  RESPONSE INTERCEPTOR (line 82-126)                                          │
│      │                                                                       │
│      ├── SUCCESS: Check X-New-Token header                                   │
│      │       └── If present: setAuthToken(), notify AuthContext              │
│      │                                                                       │
│      └── ERROR (401/403):                                                    │
│              ├── clearAuthData()                                             │
│              └── sessionExpiredHandler() → AuthContext.handleSessionExpired()│
│                      └── logout() + setError("Session expired")              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Backend Protection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Protected Endpoint Example                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  @router.get("/streams")                                                     │
│  async def get_streams(                                                      │
│      current_user: User = Depends(get_current_user)  ◄── dependency injection│
│  ):                                                                          │
│      ...                                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  get_current_user = auth_service.validate_token      (routers/auth.py:20)   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  validate_token(request, credentials, db)            (auth_service.py:246)  │
│      │                                                                       │
│      ├── 1. Extract Bearer token from Authorization header                   │
│      │                                                                       │
│      ├── 2. jwt.decode(token, SECRET_KEY, HS256)                            │
│      │       └── Raises 401 if expired/invalid                               │
│      │                                                                       │
│      ├── 3. Extract claims: email, user_id, role, org_id                    │
│      │                                                                       │
│      ├── 4. user_service.get_user_by_email(email)                           │
│      │       └── Raises 401 if user not found                                │
│      │                                                                       │
│      ├── 5. Check user.is_active                                             │
│      │       └── Raises 401 if deactivated                                   │
│      │                                                                       │
│      ├── 6. Check token refresh (80% lifetime threshold)                     │
│      │       └── If needed: request.state.new_token = new_jwt                │
│      │                                                                       │
│      └── 7. Return User object                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Token Refresh Middleware                            (main.py:48-63)        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  if request.state.new_token:                                                 │
│      response.headers["X-New-Token"] = new_token                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| Layer | File | Responsibility |
|-------|------|----------------|
| Storage | `lib/authStorage.ts` | localStorage read/write for tokens and user data |
| Frontend Auth State | `context/AuthContext.tsx` | React auth state, login/logout methods |
| Frontend API | `lib/api/index.ts` | Axios interceptors, token injection, session expiry |
| Frontend API | `lib/api/authApi.ts` | Auth endpoint calls (login, register, etc.) |
| Frontend Routes | `App.tsx` | Conditional route rendering based on auth state |
| Backend Endpoints | `routers/auth.py` | Login, register, password reset endpoints |
| Backend Logic | `services/auth_service.py` | JWT creation, validation, password hashing |
| Backend Protection | `Depends(get_current_user)` | Route guard via dependency injection |

---

## JWT Token Structure

```json
{
  "sub": "user@example.com",
  "user_id": 123,
  "org_id": 45,
  "username": "user",
  "role": "member",
  "iat": 1234567890,
  "exp": 1234571490
}
```

- **sub**: Subject (email address)
- **user_id**: Database user ID
- **org_id**: Organization ID (null for platform admins)
- **username**: Display name (derived from email)
- **role**: `platform_admin`, `org_admin`, or `member`
- **iat**: Issued-at timestamp
- **exp**: Expiration timestamp

---

## Token Refresh Mechanism

Tokens are automatically refreshed when 80% of their lifetime has passed:

1. `validate_token()` checks if `(current_time - iat) / (exp - iat) >= 0.8`
2. If true, generates new token and stores in `request.state.new_token`
3. Middleware adds `X-New-Token` header to response
4. Frontend interceptor detects header, updates localStorage
5. AuthContext notified if user data changed (role, org_id)

---

## Authentication Methods

### Password Login
```
POST /api/auth/login
Content-Type: application/x-www-form-urlencoded

username=user@example.com&password=secret
```

### Passwordless Login (Email Token)
```
POST /api/auth/request-login-token   → sends email with token
POST /api/auth/login-with-token      → exchanges token for JWT
```

### Registration
```
POST /api/auth/register
Content-Type: application/json

{ "email": "...", "password": "...", "invitation_token": "..." }
```

### Password Reset
```
POST /api/auth/request-password-reset  → sends email with token
POST /api/auth/reset-password          → sets new password
```

---

## Error Handling

| HTTP Status | Meaning | Frontend Response |
|-------------|---------|-------------------|
| 401 | Invalid/expired token, bad credentials | Clear auth data, redirect to login |
| 403 | Insufficient permissions | Clear auth data, redirect to login |
| 400 | Invalid request (bad email, expired invitation) | Show error message |
| 500 | Server error | Show error message |

---

## Security Features

- **Password hashing**: bcrypt via passlib
- **Token signing**: HS256 with secret key
- **One-time tokens**: Login and reset tokens cleared after use
- **Token expiration**: Configurable (default 60 minutes)
- **Auto-refresh**: Transparent refresh at 80% lifetime
- **No user enumeration**: "If email exists..." messages
- **Active check**: Deactivated users cannot authenticate
