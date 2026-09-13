const { createClient } = require('@supabase/supabase-js');
const manifest = require('./taxonomy-expression-resolutions-v2.json');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.body?.approvalId !== manifest.approvalId) return res.status(403).json({ error: 'Approval id mismatch' });
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase service configuration is missing');
    const supabase = createClient(url, key);
    const { data, error } = await supabase.rpc('apply_taxonomy_expression_resolutions_v2', {
      p_items: manifest.resolutions,
      p_residuals: manifest.residualBooks,
      p_approval_id: manifest.approvalId,
    });
    if (error) throw error;
    const { count: openCount, error: openError } = await supabase
      .from('unclassified_theme_logs')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'deferred']);
    if (openError) throw openError;
    if (openCount !== 6) throw new Error(`Open expression count mismatch: ${openCount}`);
    return res.status(200).json({ success: true, result: data, openExpressions: openCount, residualBooks: 7 });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
