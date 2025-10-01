  1. Domain/Business objects live in schemas/ (Python) and types/ (TypeScript) - these are pure data
  structures
  2. Request/Response wrappers live in the API layer (routers/ for Python, lib/api/ for TypeScript)
  and can wrap business objects with metadata like status, messages, etc.
  3. Schemas should NEVER have request/response types - those belong in the API layer