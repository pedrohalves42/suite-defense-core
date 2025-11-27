-- Remove v3.10.12 registration with incorrect script and wrong SHA256
DELETE FROM agent_releases 
WHERE version = 'v3.10.12-UPDATE-PATH-AGENTNAME-FIX';