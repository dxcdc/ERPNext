# Domínio de produção: estoque.cdc.org.br

Troca aplicada e validada em 08/09/2026 na VPS CDC (`76.13.227.135`). Endereço principal: **https://estoque.cdc.org.br**. O domínio anterior, `stok.cdc.org.br`, está em transição com redirecionamento HTTP 302 para o novo endereço, preservando caminho e parâmetros.

## Configuração aplicada

- Código NextERP: `/opt/nexterp/code`, branch `lab/estabilizacao-tema-cdc`; alteração funcional no commit `6726d3ac01de27380e514206018fc1fc865505cb`.
- [Rota principal](../ops/domains/estoque-custom.yaml) instalada em `/etc/easypanel/traefik/config/estoque-custom.yaml`: HTTP redireciona para HTTPS; Traefik encaminha ao frontend existente em `http://172.16.0.1:8085`.
- [Rota de transição](../ops/domains/stok-transition.yaml) instalada em `/etc/easypanel/traefik/config/stok-custom.yaml`.
- Certificado Let's Encrypt exclusivo de `estoque.cdc.org.br`, sem depender do nome antigo para renovação. O certificado antigo foi preservado para a transição.
- Site Frappe `frontend`: `host_name=https://estoque.cdc.org.br`, caches limpos e somente o backend NextERP reiniciado.
- Inventário Ansible e verificação autenticada de produção do tema atualizados para o novo endereço.
- No Core, o cliente M2M `nexterp` passou a registrar `estoque.cdc.org.br` como subdomínio. Chaves, escopos e identidades foram preservados.

O DNS público passa pelo proxy Cloudflare. As conexões internas do Core para o NextERP (`frontend`) e do extrator (`localhost`) não dependem do nome antigo. Não foram encontrados provedores de login social habilitados nem referências ao domínio antigo nas URLs dos sistemas de integração consultados no Core.

## Evidências

| Verificação | Resultado |
| :--- | :--- |
| Testes estáticos locais | 30 testes aprovados; `git diff --check` sem erros. |
| HTTP do novo domínio | Redirecionamento para HTTPS e resposta final 200, sem ciclo. |
| HTTPS público e direto na origem | `/login` respondeu 200; certificado validado, sem ignorar erros TLS. |
| Identidade autenticada pela API | HTTP 200 no novo domínio. |
| API de pendências | HTTP 200, com 243 pendências. |
| Indicador de validação de produção | `production-validation` aprovado no novo domínio. |
| JavaScript e CSS do tema | HTTP 200; SHA-256 público igual ao arquivo implantado. |
| Socket.IO | Handshake por polling respondeu 200. |
| Desk autenticado por cabeçalhos de API | `/app/cdc-pend%C3%AAncias` respondeu 200; HTML sem referência ao domínio antigo. |
| Domínio antigo | HTTP e HTTPS redirecionam para o novo; caminho e consulta preservados. |
| Comparação Core × NextERP | Feed com 3.147 pedidos; 243 pendências em ambos, sem inclusões, fechamentos, ausências ou divergências restantes. |

A comparação reutilizou a versão publicada `7257fa23-9dcb-4e7b-9194-c39008221396`, concluída em 07/09/2026 às 22:11:49 no horário de Recife. Não foi iniciada outra coleta para trocar o domínio. A verificação autenticada foi HTTP/API; não houve inspeção visual em navegador.

## Remoção do domínio antigo

O novo domínio está operacional e não depende do registro DNS de `stok.cdc.org.br`. O usuário pode remover esse registro. A remoção não foi feita nesta entrega. Enquanto o DNS antigo existir, os links antigos redirecionam; depois de sua remoção e propagação, deixam de oferecer esse redirecionamento.

As rotas de transição e o certificado antigo podem ser retirados em manutenção posterior. A remoção do registro DNS não requer excluir a aplicação, seus contêineres ou volumes.

## Recuperação

Cópias anteriores à troca estão no diretório protegido `/var/backups/nexterp-domain-20260908/`: `stok-before.yaml` contém a rota anterior e `host-name-before.json` registra apenas a presença e o valor anterior de `host_name`. Há também o bundle Git utilizado na publicação. Nenhuma credencial foi incluída na documentação ou no Git.

Se uma reversão for necessária, manter ou restaurar primeiro o DNS antigo; restaurar `stok-before.yaml` no caminho de configuração do Traefik e retirar a nova rota do diretório observado pelo provider. O arquivo anterior atende aos dois nomes. Restaurar somente a chave `host_name` conforme o registro anterior (ela estava ausente), limpar os caches e validar ambos os endereços. Não sobrescrever o restante de `site_config.json`.

Para uma volta definitiva ao endereço antigo, reverter também a URL do inventário e a checagem de domínio introduzidas no commit funcional, reiniciar o backend e restaurar o subdomínio do cliente M2M `nexterp`. A recuperação desta troca é de configuração e código; não requer restaurar bancos de dados.
