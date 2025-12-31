# Users & Authentication Cheat Sheet

## Conceptual Model

### Three-Tier Role Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                     PLATFORM ADMIN                          │
│  • org_id = NULL                                            │
│  • Manages all organizations                                │
│  • Creates global research streams                          │
│  • Can promote/demote any user                              │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌─────────────────────┐               ┌─────────────────────┐
│     ORG ADMIN       │               │     ORG ADMIN       │
│  • org_id required  │               │  • org_id required  │
│  • Manages members  │               │  • Invites users    │
│  • Manages streams  │               │  • Updates org      │
└─────────────────────┘               └─────────────────────┘
        │                                       │
   ┌────┴────┐                             ┌────┴────┐
   ▼         ▼                             ▼         ▼
┌──────┐ ┌──────┐                       ┌──────┐ ┌──────┐
│MEMBER│ │MEMBER│                       │MEMBER│ │MEMBER│
└──────┘ └──────┘                       └──────┘ └──────┘
```

### User-Organization Relationship

```
Organization (1) ─────────────< (many) Users
     │
     │ (1)
     │
     └────────────────────────< (many) Invitations
     │
     │ (many-to-many via OrgStreamSubscription)
     │
     └────────────────────────< (many) Research Streams (global)
```

- **Users belong to ONE organization** (via `org_id` foreign key)
- **Platform admins have no organization** (`org_id = NULL`)
- **Invitations pre-assign org + role** before user registers

---

## Database Models

### User Model (`backend/models.py:104-127`)

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | Integer (PK) | Primary key |
| `org_id` | Integer (FK) | Organization reference (NULL for platform admins) |
| `email` | String | Unique, login identifier |
| `password` | String | bcrypt hashed |
| `full_name` | String | Display name |
| `job_title` | String | Optional |
| `role` | Enum | `platform_admin`, `org_admin`, `member` |
| `is_active` | Boolean | Account active status |
| `login_token` | String | One-time passwordless token |
| `login_token_expires` | DateTime | Token expiration |
| `password_reset_token` | String | Password reset token |
| `password_reset_token_expires` | DateTime | Reset expiration |

### Organization Model (`backend/models.py:66-81`)

| Field | Type | Description |
|-------|------|-------------|
| `org_id` | Integer (PK) | Primary key |
| `name` | String | Organization name |
| `is_active` | Boolean | Active status |

### Invitation Model (`backend/models.py:83-101`)

| Field | Type | Description |
|-------|------|-------------|
| `invitation_id` | Integer (PK) | Primary key |
| `email` | String | Invitee email |
| `token` | String | Unique invitation token |
| `org_id` | Integer (FK) | Target organization |
| `role` | Enum | Role to assign (`org_admin` or `member`) |
| `invited_by` | Integer (FK) | User who sent invitation |
| `expires_at` | DateTime | Invitation expiration |
| `accepted_at` | DateTime | When accepted (NULL if pending) |
| `is_revoked` | Boolean | Manually revoked by admin |

---

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/register` | Register new user | No |
| `POST` | `/login` | Login with email/password | No |
| `GET` | `/validate-invitation/{token}` | Validate invitation token | No |
| `POST` | `/request-login-token` | Request passwordless login email | No |
| `POST` | `/login-with-token` | Login with one-time token | No |
| `POST` | `/request-password-reset` | Request password reset email | No |
| `POST` | `/reset-password` | Reset password with token | No |

### User Profile (`/api/user`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/me` | Get current user profile | Yes |
| `PUT` | `/me` | Update profile (name, job title) | Yes |
| `POST` | `/me/password` | Change password | Yes |

### Organization (`/api/org`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/` | Get current user's organization | Yes |
| `PUT` | `/` | Update organization (org_admin) | Yes |
| `GET` | `/members` | List organization members | Yes |
| `PUT` | `/members/{user_id}` | Update member role (org_admin) | Yes |
| `DELETE` | `/members/{user_id}` | Remove member (org_admin) | Yes |

---

## Request/Response Examples

### Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "invitation_token": "optional-token"  // optional
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user_id": 123,
  "email": "user@example.com",
  "username": "user",
  "role": "member",
  "org_id": 1
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/x-www-form-urlencoded

username=user@example.com&password=securepassword
```

**Response:** Same as register

### Passwordless Login Flow

**Step 1: Request token**
```http
POST /api/auth/request-login-token
Content-Type: application/x-www-form-urlencoded

email=user@example.com
```

**Step 2: Login with token (from email link)**
```http
POST /api/auth/login-with-token
Content-Type: application/x-www-form-urlencoded

token=abc123securetokenfromemail
```

---

## JWT Token Details

### Configuration (`backend/config/settings.py`)

| Setting | Value | Description |
|---------|-------|-------------|
| `JWT_SECRET_KEY` | env var | Signing secret |
| `ALGORITHM` | `HS256` | Signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Token lifetime |

### Token Payload Structure

```json
{
  "sub": "user@example.com",
  "user_id": 123,
  "org_id": 456,
  "username": "user",
  "role": "member",
  "exp": 1704067200
}
```

### Token Validation Flow

```
Client Request                    Backend
     │                               │
     │ Authorization: Bearer {jwt}   │
     │──────────────────────────────>│
     │                               │
     │                     ┌─────────┴─────────┐
     │                     │ 1. Decode JWT     │
     │                     │ 2. Verify sig     │
     │                     │ 3. Check exp      │
     │                     │ 4. Lookup user    │
     │                     │ 5. Check active   │
     │                     └─────────┬─────────┘
     │                               │
     │    200 OK / 401 Unauthorized  │
     │<──────────────────────────────│
```

---

## Frontend Architecture

### Auth Context (`frontend/src/context/AuthContext.tsx`)

```typescript
interface AuthContextType {
  // State
  isAuthenticated: boolean
  user: AuthUser | null
  error: string | null

  // Role helpers
  isPlatformAdmin: boolean
  isOrgAdmin: boolean

  // Methods
  login(credentials: LoginCredentials): Promise<void>
  loginWithToken(token: string): Promise<void>
  requestLoginToken(email: string): Promise<void>
  register(credentials: RegisterCredentials): Promise<void>
  logout(): void

  // Loading states
  isLoginLoading: boolean
  isTokenLoginLoading: boolean
  isTokenRequestLoading: boolean
  isRegisterLoading: boolean
}
```

### Token Storage (localStorage)

| Key | Value | Description |
|-----|-------|-------------|
| `authToken` | JWT string | Access token |
| `user` | JSON | Cached user data |
| `sessionData` | JSON | Session metadata |

### API Services

| File | Purpose |
|------|---------|
| `authApi.ts` | Login, register, token requests |
| `userApi.ts` | Profile management |
| `organizationApi.ts` | Org and member management |

### Usage in Components

```typescript
import { useAuth } from '@/context/AuthContext'

function MyComponent() {
  const {
    isAuthenticated,
    user,
    isPlatformAdmin,
    isOrgAdmin,
    login,
    logout
  } = useAuth()

  if (!isAuthenticated) {
    return <LoginForm />
  }

  return <Dashboard user={user} />
}
```

---

## Authentication Flows

### Standard Login Flow

```
┌──────────┐     POST /login      ┌─────────┐     verify      ┌──────────┐
│  Client  │ ──────────────────>  │  Auth   │ ─────────────>  │   DB     │
│          │                      │ Service │                 │          │
│          │  <──────────────────  │         │  <─────────────  │          │
│          │     JWT Token        │         │    User data    │          │
└──────────┘                      └─────────┘                 └──────────┘
     │
     │ Store in localStorage
     ▼
┌──────────────────┐
│ authToken: "..." │
│ user: {...}      │
└──────────────────┘
```

### Passwordless Login Flow

```
┌──────────┐  request-login-token  ┌─────────┐   store token   ┌──────────┐
│  Client  │ ────────────────────> │  Auth   │ ──────────────> │   DB     │
│          │                       │ Service │                 │          │
└──────────┘                       └─────────┘                 └──────────┘
                                        │
                                        │ send_login_token()
                                        ▼
                                   ┌─────────┐
                                   │  Email  │
                                   │ Service │
                                   └─────────┘
                                        │
                                        │ Email with link
                                        ▼
                                   ┌──────────┐
                                   │   User   │
                                   │  Inbox   │
                                   └──────────┘
                                        │
                                        │ Click link
                                        ▼
┌──────────┐  login-with-token     ┌─────────┐   clear token   ┌──────────┐
│  Client  │ ────────────────────> │  Auth   │ ──────────────> │   DB     │
│          │  <────────────────── │ Service │  <──────────────  │          │
│          │     JWT Token        │         │    User data     │          │
└──────────┘                      └─────────┘                  └──────────┘
```

### Registration with Invitation Flow

```
┌──────────┐  validate-invitation  ┌─────────┐     lookup      ┌──────────┐
│  Client  │ ────────────────────> │  Auth   │ ──────────────> │   DB     │
│          │  <────────────────── │ Service │  <──────────────  │          │
│          │   {org_name, role}   │         │   Invitation    │          │
└──────────┘                      └─────────┘                  └──────────┘
     │
     │ User fills form
     ▼
┌──────────┐  register + token     ┌─────────┐  create user    ┌──────────┐
│  Client  │ ────────────────────> │  Auth   │ ──────────────> │   DB     │
│          │                       │ Service │ mark accepted   │          │
│          │  <──────────────────  │         │  <──────────────  │          │
│          │     JWT Token        │         │                  │          │
└──────────┘                      └─────────┘                  └──────────┘
```

---

## Role-Based Access Control

### Permission Matrix

| Action | Platform Admin | Org Admin | Member |
|--------|----------------|-----------|--------|
| View own profile | ✅ | ✅ | ✅ |
| Update own profile | ✅ | ✅ | ✅ |
| View org members | ✅ | ✅ | ✅ |
| Update org settings | ✅ | ✅ | ❌ |
| Invite members | ✅ | ✅ | ❌ |
| Update member roles | ✅ | ✅ (within org) | ❌ |
| Remove members | ✅ | ✅ (within org) | ❌ |
| Create global streams | ✅ | ❌ | ❌ |
| Manage all orgs | ✅ | ❌ | ❌ |

### Checking Roles in Frontend

```typescript
const { isPlatformAdmin, isOrgAdmin, user } = useAuth()

// Platform admin check
if (isPlatformAdmin) {
  // Show admin panel
}

// Org admin or higher
if (isOrgAdmin || isPlatformAdmin) {
  // Show org management
}

// Direct role check
if (user?.role === 'platform_admin') {
  // ...
}
```

### Checking Roles in Backend

```python
from services.auth_service import validate_token

# Dependency injection in route
@router.get("/admin-only")
async def admin_route(current_user: User = Depends(validate_token)):
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
    return {"data": "secret"}

# Using service helpers
from services.organization_service import require_org_admin

@router.put("/org/settings")
async def update_org(
    data: OrgUpdate,
    current_user: User = Depends(validate_token),
    db: Session = Depends(get_db)
):
    require_org_admin(current_user, db)  # Raises 403 if not admin
    # ...
```

---

## Security Features

| Feature | Implementation |
|---------|----------------|
| Password hashing | bcrypt with automatic salt |
| JWT signing | HS256 with secret key |
| Token expiration | 60 minutes (configurable) |
| One-time login tokens | 30 minute expiry, cleared after use |
| Password reset tokens | 1 hour expiry, cleared after use |
| Invitation tokens | Expirable, single-use, revocable |
| Minimum password length | 5 chars (register), 8 chars (reset) |

---

## Key Files Reference

### Backend

| File | Purpose |
|------|---------|
| `models.py` | SQLAlchemy models (User, Organization, Invitation) |
| `schemas/user.py` | User Pydantic schemas |
| `schemas/auth.py` | Auth request/response schemas |
| `schemas/organization.py` | Org schemas |
| `routers/auth.py` | Auth endpoints |
| `routers/user.py` | User profile endpoints |
| `routers/organization.py` | Org management endpoints |
| `services/auth_service.py` | JWT, password hashing, validation |
| `services/user_service.py` | User CRUD operations |
| `services/organization_service.py` | Org management |
| `services/login_email_service.py` | Token generation, email sending |

### Frontend

| File | Purpose |
|------|---------|
| `context/AuthContext.tsx` | Auth state management |
| `context/OrganizationContext.tsx` | Org state management |
| `lib/api/authApi.ts` | Auth API calls |
| `lib/api/userApi.ts` | User API calls |
| `lib/api/organizationApi.ts` | Org API calls |
| `components/auth/LoginForm.tsx` | Login/register UI |
| `types/user.ts` | User TypeScript types |
| `types/organization.ts` | Org TypeScript types |
