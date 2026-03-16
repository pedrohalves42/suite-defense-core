-- Replace old v5.0.14 content with updated script content from the new entry
UPDATE agent_releases 
SET script_content = (SELECT script_content FROM agent_releases WHERE id = 'e2edbd73-37da-4c73-8b12-9b861d63a366'),
    sha256 = (SELECT sha256 FROM agent_releases WHERE id = 'e2edbd73-37da-4c73-8b12-9b861d63a366')
WHERE id = '092b44ca-e41a-4090-8431-31c0944e8ba8';

-- Remove the duplicate v5.0.13 entry
DELETE FROM agent_releases WHERE id = 'e2edbd73-37da-4c73-8b12-9b861d63a366';