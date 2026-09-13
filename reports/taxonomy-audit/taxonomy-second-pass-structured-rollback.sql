-- Removes only links introduced by the approved second pass.
delete from public.book_taxonomy_v2 b
using (values
  ('a11e1567-1d31-4055-b8d8-e95ec3c696df'::uuid, 'context', '사회적 민감 맥락'),
  ('9ee63504-231a-4763-b25a-e49e1206b294'::uuid, 'context', '사회적 민감 맥락'),
  ('1d7fce4e-9464-4183-949c-d91e75e6198e'::uuid, 'context', '사회적 민감 맥락'),
  ('a03f49fe-a02b-4967-8709-1a794a53c6d2'::uuid, 'context', '사회적 민감 맥락'),
  ('8ef9d116-3ec5-4ff8-b4db-92433cbef7af'::uuid, 'context', '사회적 민감 맥락'),
  ('fab6d404-aee6-4c3b-9012-d2424e5aec34'::uuid, 'context', '사회적 민감 맥락'),
  ('182e8509-207e-4024-9d7c-f630f02f3040'::uuid, 'context', '사회적 민감 맥락'),
  ('8d431008-3ed2-42d5-bc7b-fd48fdbc4877'::uuid, 'context', '사회적 민감 맥락'),
  ('404ab686-fd4d-4528-a3b3-5c4ef5a64278'::uuid, 'context', '사회적 민감 맥락'),
  ('9e69197d-d40d-442a-933f-9a0982fdf9a8'::uuid, 'context', '사회적 민감 맥락'),
  ('f3cbb526-27f0-4fc9-906e-a3603365272a'::uuid, 'context', '사회적 민감 맥락'),
  ('b9b0627b-4152-4b02-904f-aa0c1f8c8b9e'::uuid, 'context', '사회적 민감 맥락'),
  ('7219ff7f-ab76-4603-af49-3896efdbe2ae'::uuid, 'context', '사회적 민감 맥락'),
  ('4681fc6b-8a55-4370-869e-b55c3f4042e2'::uuid, 'context', '사회적 민감 맥락'),
  ('99d1ac30-e297-4a4a-b27b-eb0f6a77e438'::uuid, 'context', '사회적 민감 맥락'),
  ('921337d2-714b-4c37-abab-0bef5f733835'::uuid, 'context', '사회적 민감 맥락'),
  ('2c828561-982f-434b-82bc-2d5921f96da2'::uuid, 'context', '사회적 민감 맥락'),
  ('bf073aef-f373-417d-bb38-2d74214f0c6f'::uuid, 'context', '사회적 민감 맥락'),
  ('e5d19870-4176-4cfe-8801-69e20f9467c6'::uuid, 'context', '사회적 민감 맥락'),
  ('59794941-9642-4101-8ecf-b79bc9a8c414'::uuid, 'interest', '사회·경제·직업'),
  ('57420612-5dcf-4ce2-94d2-07cd92ee2cb0'::uuid, 'subject', '상상·판타지'),
  ('57420612-5dcf-4ce2-94d2-07cd92ee2cb0'::uuid, 'subject', '문제해결'),
  ('1f093c66-7f07-48e4-a91e-51c0611f10a4'::uuid, 'subject', '책임·자기조절'),
  ('b22d9249-5a19-4dd5-840f-c0af4425b12b'::uuid, 'subject', '책임·자기조절'),
  ('49f0619a-9959-4acc-a40b-7487afd53731'::uuid, 'interest', '탈것·도시'),
  ('3b17c8a8-0eaf-447e-be54-bd6c4e14547a'::uuid, 'subject', '의사소통'),
  ('2ccc3431-e09b-4007-bdba-9dec40262805'::uuid, 'interest', '사회·경제·직업')
) as approved(book_id, axis, target)
where b.book_id = approved.book_id
  and b.axis = approved.axis
  and b.target = approved.target
  and b.taxonomy_version = '2.0-draft.3'
  and b.approval_source = 'human-approved-second-pass';
