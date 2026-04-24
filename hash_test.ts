const token = '150cb40e-d33c-4a32-b549-e23d796ee7bc';
const encoder = new TextEncoder();
const data = encoder.encode(token);
const hashBuffer = await crypto.subtle.digest('SHA-256', data);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
console.log(hash);
