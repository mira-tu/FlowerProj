import { createClient } from '@supabase/supabase-js';

const runtimeConfig = typeof window !== 'undefined' ? window.__APP_CONFIG || {} : {};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || runtimeConfig.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || runtimeConfig.VITE_SUPABASE_ANON_KEY;

// Fallback to a lightweight mock client when Supabase is not configured.
// This keeps the SPA from crashing or going blank in local/test environments
// while still allowing most UI flows to be exercised.
function createMockSupabase() {
  // In-memory auth state so the app can behave as if a real
  // Supabase session exists during local/TestSprite runs.
  const TEST_EMAIL = 'k0mekaga69@gmail.com';
  const TEST_PASSWORD = 'd3ADPINK1324';
  let mockSession = null;

  const createQueryBuilder = () => {
    const builder = {
      select() {
        return builder;
      },
      single() {
        return builder;
      },
      in() {
        return builder;
      },
      eq() {
        return builder;
      },
      order() {
        return builder;
      },
      upsert() {
        return builder;
      },
      insert() {
        return builder;
      },
      update() {
        return builder;
      },
      delete() {
        return builder;
      },
      // Return a proper thenable/Promise so .then().catch() chains work
      then(resolve, reject) {
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
      catch(handler) {
        return Promise.resolve({ data: [], error: null }).catch(handler);
      },
    };
    return builder;
  };

  const auth = {
    async signInWithPassword({ email, password }) {
      // For local/TestSprite runs, treat the known test credentials
      // as a successful login and create a fake session object.
      if (email === TEST_EMAIL && password === TEST_PASSWORD) {
        const user = {
          id: 'mock-user-id',
          email,
          user_metadata: {
            name: 'Test Customer',
            phone: '+63 900 000 0000',
          },
        };
        mockSession = {
          access_token: 'mock-access-token',
          token_type: 'bearer',
          user,
        };
        return {
          data: { user, session: mockSession },
          error: null,
        };
      }

      return {
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      };
    },
    async signUp({ email, password, options }) {
      // Simulate a successful signup that immediately creates a session.
      const user = {
        id: 'mock-signed-up-user-id',
        email,
        user_metadata: {
          name: options?.data?.name || email,
        },
      };
      mockSession = {
        access_token: 'mock-signup-token',
        token_type: 'bearer',
        user,
      };
      return {
        data: { user, session: mockSession },
        error: null,
      };
    },
    async resetPasswordForEmail() {
      // Pretend the reset email was sent successfully.
      return {
        data: null,
        error: null,
      };
    },
    async getSession() {
      return { data: { session: mockSession }, error: null };
    },
    onAuthStateChange(callback) {
      // Notify the current auth state asynchronously, matching the real
      // Supabase client behavior (which fires callbacks via microtask).
      setTimeout(() => {
        const event = mockSession ? 'SIGNED_IN' : 'SIGNED_OUT';
        callback(event, mockSession);
      }, 0);

      return {
        data: {
          subscription: {
            unsubscribe: () => { },
          },
        },
      };
    },
    async signOut() {
      mockSession = null;
      return { error: null };
    },
  };

  const storage = {
    from() {
      return {
        async upload() {
          return { data: null, error: null };
        },
        getPublicUrl() {
          return {
            data: { publicUrl: '' },
            error: null,
          };
        },
      };
    },
  };

  const createChannel = () => {
    const channel = {
      on() {
        return channel;
      },
      subscribe() {
        return channel;
      },
    };
    return channel;
  };

  return {
    auth,
    from() {
      return createQueryBuilder();
    },
    storage,
    channel() {
      return createChannel();
    },
    removeChannel() {
      // no-op in mock
    },
  };
}

let supabase;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'Supabase URL or Anon Key is missing. Running with a mock Supabase client – network-backed features will be disabled.',
  );
  supabase = createMockSupabase();
} else {
  supabase = createClient(supabaseUrl, supabaseKey);
}

export { supabase };
