# Database Schema: alzy

```mermaid
erDiagram
    users {
        integer id PK
        varchar name
        varchar email
        user_role role
        boolean is_active
        jsonb providers
        timestamptz created_at
        timestamptz updated_at
        timestamptz last_login_at
    }

    devices {
        integer id PK
        integer user_id FK
        varchar name
        device_platform platform
        varchar device_key_hash
        varchar pairing_token_hash
        timestamptz pairing_expires_at
        timestamptz paired_at
        boolean is_active
        timestamptz last_seen_at
        timestamptz created_at
        timestamptz deleted_at
        timestamptz updated_at
        device_color color
    }

    sessions {
        integer id PK
        integer device_id FK
        integer user_id FK
        session_status status
        timestamptz started_at
        timestamptz ended_at
        timestamptz created_at
        timestamptz updated_at
    }

    points {
        bigint id PK
        integer device_id FK
        integer session_id FK
        numeric lat
        numeric lng
        geometry geom
        float8 accuracy
        float8 speed
        float8 heading
        float8 altitude
        point_source source
        timestamptz recorded_at
        timestamptz received_at
    }

    spatial_ref_sys {
        integer srid PK
        varchar auth_name
        integer auth_srid
        varchar srtext
        varchar proj4text
    }

    topology.layer {
        integer topology_id PK,FK
        integer layer_id PK
        varchar schema_name
        varchar table_name
        varchar feature_column
        integer feature_type
        integer level
        integer child_id
    }

    topology.topology {
        integer id PK
        varchar name
        integer srid
        float8 precision
        boolean hasz
        boolean useslargeids
    }

    users ||--o{ devices : "has"
    users ||--o{ sessions : "has"
    devices ||--o{ sessions : "creates"
    devices ||--o{ points : "records"
    sessions ||--o{ points : "contains"
```

## Enumerated Types

### device_platform
- android
- ios
- web

### device_color
- blue
- green
- red
- yellow
- purple
- orange
- pink
- gray

### session_status
- active
- ended
- paused

### user_role
- user
- admin

### point_source
- gps
- network
- fused
- manual

## Relationships

1. **users → devices** (1:N): One user can have multiple devices
2. **users → sessions** (1:N): One user can have multiple sessions
3. **devices → sessions** (1:N): One device can create multiple sessions
4. **devices → points** (1:N): One device can record multiple points
5. **sessions → points** (1:N): One session can contain multiple points
6. **topology → layer** (1:N): One topology can have multiple layers

## Notes

- The database uses PostGIS for spatial data (geometry types)
- Soft deletion is implemented via `deleted_at` timestamp
- Timestamps use timezone-aware timestamps (`timestamptz`)
- JSONB is used for flexible provider data in users table
- Custom enumerated types are used for platform, color, status, role, and source