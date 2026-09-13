const { createClient } = require('@supabase/supabase-js');
const manifest = require('./taxonomy-approved-links-v2.json');

const APPROVAL_ID = 'taxonomy-v2-draft-2-20260913';
const chunk = (items, size) => Array.from(
  { length: Math.ceil(items.length / size) },
  (_, index) => items.slice(index * size, (index + 1) * size)
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.body?.approvalId !== APPROVAL_ID) return res.status(403).json({ error: 'Approval id mismatch' });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Service configuration missing' });

  try {
    const supabase = createClient(url, key);
    const { error: categoryError } = await supabase
      .from('taxonomy_categories_v2')
      .upsert(manifest.categories, { onConflict: 'axis,target' });
    if (categoryError) throw categoryError;

    for (const group of chunk(manifest.links, 200)) {
      const { error } = await supabase
        .from('book_taxonomy_v2')
        .upsert(group, { onConflict: 'book_id,axis,target' });
      if (error) throw error;
    }

    const { count, error: countError } = await supabase
      .from('book_taxonomy_v2')
      .select('*', { count: 'exact', head: true })
      .eq('taxonomy_version', '2.0-draft.2')
      .eq('approval_source', 'human-approved-batch-review');
    if (countError) throw countError;
    if (count !== manifest.links.length) throw new Error(`Verification count mismatch: ${count}`);
    return res.status(200).json({ success: true, categories: manifest.categories.length, links: count });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports.APPROVAL_ID = APPROVAL_ID;
module.exports.chunk = chunk;
