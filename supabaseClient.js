import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js@2.54.0';

console.log("supabaseClient.js geladen!");

export const supabase = createClient(
  'https://buduldeczjwnjvsckqat.supabase.co',
  'sb_publishable_wcOHaKNEW9rQ3anrRNlEpA_r1_wGda3',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'supabase.auth.token',
      autoRefreshTokenRetryAttempts: 3
    },
    global: {
      headers: {
        'X-Client-Info': 'fifa-tracker/1.0.0'
      }
    }
  }
);

class SupabaseWrapper {
  constructor(client) {
    this.client = client;
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
  }

  async retryOperation(operation, maxRetries = this.maxRetries) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        if (result.error) throw result.error;
        return result;
      } catch (error) {
        lastError = error;
        console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error);
        if (this.isNonRetryableError(error)) throw error;
        if (attempt === maxRetries) throw error;
        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  isNonRetryableError(error) {
    if (!error) return false;
    if (error.message && error.message.includes('auth')) return true;
    if (error.code === 'PGRST301' || error.code === 'PGRST116') return true;
    return false;
  }

  async select(table, query = '*', options = {}) {
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).select(query);
      if (options.eq) {
        Object.entries(options.eq).forEach(([column, value]) => {
          queryBuilder = queryBuilder.eq(column, value);
        });
      }
      if (options.order) {
        queryBuilder = queryBuilder.order(options.order.column, { 
          ascending: options.order.ascending ?? true 
        });
      }
      if (options.limit) {
        queryBuilder = queryBuilder.limit(options.limit);
      }
      return await queryBuilder;
    });
  }

  async insert(table, data) {
    return this.retryOperation(async () => {
      return await this.client.from(table).insert(data);
    });
  }

  async update(table, data, id) {
    return this.retryOperation(async () => {
      return await this.client.from(table).update(data).eq('id', id);
    });
  }

  async delete(table, id) {
    return this.retryOperation(async () => {
      return await this.client.from(table).delete().eq('id', id);
    });
  }

  getClient() {
    return this.client;
  }
}

export const supabaseDb = new SupabaseWrapper(supabase);

// Auth event handler - KEIN renderLoginArea() Aufruf hier!
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event, session?.user?.email || 'No user');
  if (event === 'TOKEN_REFRESHED') {
    if (session) {
      console.log('Auth token refreshed successfully');
    } else {
      console.error('Token refresh failed - user may need to re-authenticate');
      // Optional: Session-Expiry Event für die UI
      window.dispatchEvent(new Event('supabase-session-expired'));
    }
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out');
  } else if (event === 'SIGNED_IN') {
    console.log('User signed in');
  }
});

// Am Ende von supabaseClient.js
window.supabase = supabase;
window.supabaseDb = supabaseDb;