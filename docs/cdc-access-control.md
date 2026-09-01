# Controle de acesso CDC

## Objetivo

Combinar os perfis e permissoes nativos do Frappe/ERPNext com excecoes
administrativas por usuario ou perfil, sem ampliar implicitamente o escopo de
dados por armazem.

## Dimensoes

O acesso efetivo e calculado por:

1. sujeito: usuario ou perfil de funcao;
2. programa: agrupador funcional CDC;
3. pagina: rota funcional cadastrada no catalogo CDC;
4. acao: visualizar, criar, editar, finalizar, cancelar, exportar ou excluir;
5. escopo: intersecao com os armazens autorizados por `User Permission`;
6. vigencia: periodo opcional da excecao.

## Precedencia

1. `System Manager` conserva o acesso administrativo nativo;
2. durante uma pre-visualizacao, o contexto simulado restringe o administrador;
3. bloqueio individual ativo;
4. liberacao individual ativa;
5. bloqueio de perfil ativo;
6. liberacao de perfil ativa;
7. papeis e perfis nativos existentes;
8. negado por padrao.

Uma liberacao de pagina nunca concede um novo armazem. Quando a excecao cita
armazens, eles funcionam como uma restricao adicional sobre o escopo nativo do
usuario, nunca como uniao ou elevacao de acesso.

## Excecoes

- somente `System Manager` pode criar, alterar, desativar ou remover excecoes;
- toda excecao exige justificativa e registra autor e data;
- excecoes podem ser permanentes ou ter inicio e fim;
- excecoes vencidas deixam de produzir efeito sem serem apagadas;
- alteracoes geram historico administrativo imutavel;
- o perfil `System Manager` nao pode ser reduzido por esta camada.

## Pre-visualizacao

- somente `System Manager` pode iniciar o modo;
- o modo simula um usuario ou perfil sem trocar a identidade autenticada;
- a simulacao e somente leitura e toda escrita deve ser recusada no backend;
- usuario simulado usa seu escopo real de armazens;
- perfil simulado exige a escolha de um escopo de armazens para teste;
- uma faixa persistente identifica o alvo e permite encerrar o modo;
- inicio e encerramento sao auditados;
- o contexto e curto, assinado no servidor e nao confia apenas no navegador.

## Compatibilidade

- `Role`, `Role Profile`, permissoes de DocType e `User Permission` continuam
  sendo a fonte primaria;
- a camada CDC decide visibilidade de programas/paginas e excecoes funcionais;
- consultas e operacoes continuam sujeitas as permissoes nativas;
- os acessos atuais permanecem inalterados ate que uma excecao seja criada.

## Criterios de seguranca

- rota oculta tambem deve ser recusada por API;
- armazem fora do escopo deve retornar vazio ou `PermissionError`;
- ausencia de vinculo de armazem resulta em escopo operacional vazio;
- cache de acesso deve ser invalidado apos alteracao administrativa;
- a matriz deve mostrar a origem do acesso: perfil, papel, excecao ou bloqueio;
- nenhuma metrica ou dado de pre-visualizacao pode ser simulado.
