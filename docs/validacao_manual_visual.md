# Roteiro de validação manual e visual

Este roteiro cobre resultados que testes de banco e API não conseguem provar. Cada execução deve anexar captura de tela, usuário/papel utilizado, data, navegador e resultado observado.

## Preparação

- [ ] Registrar hash/commit testado.
- [ ] Confirmar que o ambiente é laboratório.
- [ ] Desabilitar webhooks reais antes de criar lançamentos de teste.
- [ ] Separar usuários `Administrador`, `Operacional` e `Sem acesso`.
- [ ] Registrar resolução desktop e móvel utilizadas.

## Autorização por perfil

| Jornada | Administrador | Operacional autorizado | Usuário sem acesso |
|---|---|---|---|
| Abrir CDC Estoque | Deve abrir | Deve abrir | Deve negar ou ocultar |
| Abrir CDC Usuários | Deve abrir | Conforme decisão de negócio | Deve negar |
| Abrir CDC Pendências | Deve abrir | Conforme papel CDC | Deve negar |
| Configurar/testar Mattermost | Deve abrir | Deve negar | Deve negar |
| Consultar API diretamente | Deve respeitar as mesmas regras da tela | Deve respeitar seu escopo | Deve retornar 403 |

## Jornada de estoque

- [ ] Cards carregam valores coerentes com o relatório nativo.
- [ ] Projeto filtra somente seus armazéns.
- [ ] “Mostrar todos” restaura a visão consolidada.
- [ ] Abas Todos, Entradas e Saídas exibem registros compatíveis.
- [ ] Ordenação e cabeçalho fixo permanecem utilizáveis.
- [ ] Cada uma das seis rotas de projeto mantém breadcrumb e retorno.
- [ ] Lançamento manual pode ser salvo sem campos ONGSYS.
- [ ] Campos ONGSYS aparecem somente em documento integrado e são somente leitura.
- [ ] Adicionar lançamento abre o formulário nativo e respeita permissões.

## Relatórios

- [ ] Lançamento no Estoque mostra lista, filtros e botão de inclusão.
- [ ] Livro de Inventários abre com empresa e datas válidas.
- [ ] Balanço de Estoque coincide com uma amostra de itens/armazéns.
- [ ] Exportação gera arquivo legível e não deixa a página travada.

## Usuários, pendências e integrações

- [ ] CDC Usuários mostra usuários do ERPNext, não usuários da API.
- [ ] Filtros Projeto → Armazém reduzem cards e tabela corretamente.
- [ ] CDC Pendências mostra status, itens, quantidades e última sincronização.
- [ ] Busca, ordenação e rolagens funcionam por teclado e mouse.
- [ ] Editar e apagar configuração Mattermost respeitam confirmação e papel.
- [ ] Diagnóstico Mattermost não exibe HTML vindo de mensagens de erro.

## Visual e acessibilidade

- [ ] Logotipo e ícones não deformam em desktop e móvel.
- [ ] Não existem grandes áreas vazias ou sobreposição de cards.
- [ ] Breadcrumb não gera falso “Não encontrado”.
- [ ] Foco do teclado permanece visível em links, selects e botões.
- [ ] Tabelas são utilizáveis com zoom de 200%.
- [ ] Estados de carregamento, vazio e erro são compreensíveis.

## Registro da execução

| Data | Commit | Perfil | Jornada | Resultado | Evidência | Responsável |
|---|---|---|---|---|---|---|
| AAAA-MM-DD | hash | papel | nome | Aprovado/Reprovado | caminho ou URL | nome |
