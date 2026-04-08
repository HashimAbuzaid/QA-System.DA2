import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://twhsnbyrsitqkosjxssh.supabase.co';
const supabaseAnonKey = 'sb_publishable_77x1moWHVtXmxLriCDae5g_QjXGwDdx';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
