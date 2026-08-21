-- Abandoned PostgREST transactions (client disconnect / aborted save_shader_state)
-- previously sat idle forever while holding shaders row locks, which exhausted
-- the pool and made GET /shaders hang. Kill those sessions automatically.
alter role authenticator set idle_in_transaction_session_timeout = '8s';
alter role authenticated set idle_in_transaction_session_timeout = '8s';
alter role anon set idle_in_transaction_session_timeout = '8s';
alter role service_role set idle_in_transaction_session_timeout = '15s';
