# Security Policy

## Reporting Security Issues

Se você descobrir uma vulnerabilidade de segurança, **não** abra uma issue pública.

Envie um email para: [seu-email@example.com]

## Security Best Practices

- **Nunca** versione arquivos `.env` ou credenciais
- **Sempre** use GitHub Secrets para variáveis sensíveis
- **Regenere** credenciais regularmente
- **Revise** logs de acesso do Supabase

## Compliance

Este projeto segue as práticas recomendadas de segurança:
- ✅ Environment variables não versionadas
- ✅ Pre-commit hooks para detecção de segredos
- ✅ Secret scanning ativado
- ✅ Branch protections implementadas