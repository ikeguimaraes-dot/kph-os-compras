# Aceite F1 — posição operacional 85/86

Migration aplicada: `20261028021932_posicao_86_operacional.sql`. Projeto Supabase `iqgrvptrtphvbmvrqntm`.
Fonte dos dados: listas históricas e identidades confirmadas por Henrique nesta conversa. Horários em America/Sao_Paulo. A data de confirmação histórica é separada do timestamp real de registro no banco.

## Resultados confirmados no Supabase

| Casa | 23/10 18:30 · 86 | 26/10 11:00 · 86 | 26/10 · 85 |
|---|---:|---:|---:|
| Meet & Eat | 4 | 10 | 0 |
| Frêneze | 2 | 2 | 2 |
| Madonna | 1 | 0 | 2 |
| Match Point | 1 | 0 | 1 |
| Total | 8 | 12 | 5 |

23/10: 2 sazonalidade, 4 produção, 2 fora do padrão.
26/10: 1 sazonalidade, 7 compra, 1 produção, 2 fora do padrão, 1 não informado.

- Retornos: Costelinha BBQ (Frêneze), Paleta de Cordeiro (Madonna), Fettuccine (Match).
- Continuidade: Parrilla, Lagosta, Mix, Denver Steak (Meet); Denver (Frêneze).
- Motivo alterado: Parrilla e Lagosta, sazonalidade → compra. Histórico preserva motivo anterior.
- 85: Provoleta e Chorizo Angus (Frêneze), Chorizo de Wagyu e Stracciatella (Madonna), Filé Mignon (Match). Motivo não informado; não foi inferido. Não expõem produtos afetados na leitura operacional.
- Risco eventos 23/10: 2 EVA do Mix + ficha EVA MENU 5T CONFRARIA. Em 26/10: somente os 2 EVA do Mix; o cordeiro retornou.
- Pão Filão: ocorrência contada, identidade sem identificação, nenhum produto afetado. Pendência persistida em posicao_86_item.pendencia para cadastro pelo gerente do Frêneze.
- Paleta: base 5000090; afetados AGNELLO, PAPADELI e PRINCIPAL PAPARDELI, confirmados pelo usuário. Risco EVA por FK de ficha.

Persistidos: 20 identidades operacionais, 29 vínculos de afetados, 8 confirmações, 28 eventos (20 aberturas, 5 atualizações, 3 retornos). Nenhum histórico apagado.

## Vínculos de ficha pendentes — 21

São vínculos operacionais explicitamente confirmados pelo usuário. O estado pendente abaixo é uma fotografia do cadastro produto_venda_ficha na carga; nenhuma sugestão foi usada. A F1 não altera o cadastro original de fichas.

| Casa | Item operacional | Produto afetado | ID |
|---|---|---|---|
| Meet & Eat | Mix de Linguiças | EVA MIX DE LINGUICA | b2b50c37-1341-4b62-b388-c71ea84e3ee3 |
| Meet & Eat | Mix de Linguiças | EVA MIX D LINGUICAS ARTESANAIS | 5cb851ae-a70e-422f-89bc-b05816457214 |
| Meet & Eat | Denver Steak | DENVER STEAK 250G | 2af083e6-1df2-448e-b565-3051b5a02a24 |
| Meet & Eat | Denver Steak | DENVER STEAK 300G | d3c542fb-f266-4a79-a7a8-835f82b95d81 |
| Meet & Eat | Denver Steak | DENVER STEAK COPA | 5886367f-fb8f-48d0-affb-192e933c62cb |
| Meet & Eat | Prime Rib VV | PRIME RIB VACA VELHA 100G | e324fa9b-f1e5-4ed5-ac11-21eaeb031056 |
| Meet & Eat | Cosmopolito | COSMOPOLITAN GREY GROOSE | f7c231b9-8f80-4ff3-8f63-34a36b973567 |
| Meet & Eat | Cosmopolito | COSMOPOLITAN SKYY | 4e1baf07-3cc5-43b4-9727-d83b69fc65c6 |
| Meet & Eat | Margarida | MARGARITA | afd5f399-627c-4bf3-80d9-f73f35a0f626 |
| Frêneze | Costelinha BBQ | EXE COSTELINHA BBQ | f0034e58-634b-415b-a5ba-08f55ba4eb61 |
| Frêneze | Costelinha BBQ | ROD COSTELA BBQ - UND | 201aa12f-5247-4603-9216-e05d72bd80d6 |
| Frêneze | Denver | EXE DENVER | 6b8511df-eaa0-4f34-b447-075cc4d21363 |
| Frêneze | Denver | ROD DENVER - UND | 6b9c0481-b6b9-41bf-b7b4-e20fd54b3fc1 |
| Frêneze | Provoleta | ROD PROVOLETA - UND | 6d1af238-5ae3-42b7-8eff-ded3bae27360 |
| Madonna SP Itaim | Paleta de Cordeiro | AGNELLO | 9d277e41-a1fc-4059-9354-2bef0512b92f |
| Madonna SP Itaim | Paleta de Cordeiro | PAPADELI | dd44fb3c-41cf-401f-91d2-ec27fc91c65e |
| Madonna SP Itaim | Paleta de Cordeiro | PRINCIPAL PAPARDELI | d0de1778-e7c6-4a14-ab58-9a68b86c5778 |
| Match Point | Fettuccine | FETUCCINE | 86774d67-6eb8-4737-a7f5-fa1702c6389c |
| Match Point | Fettuccine | FETTUCCINE 4 QUEIJOS | b2b5ac7b-9ce8-41dd-ab9a-81c74f65f594 |
| Match Point | Fettuccine | FETTUCCINE AO SUGO | 5e342780-f703-4855-8e04-a565a054f153 |
| Match Point | Fettuccine | FETTUCCINE COGUMELO | a0dc9b65-f157-4cdb-be94-5e9031ba184a |

## Contrato técnico e validação

- posicao_86_item e posicao_86_afetado: FKs, casa validada, identidades e vínculos imutáveis; origem explícita confirmacao_usuario/ficha_nivel_2.
- posicao_86_confirmacao e posicao_86_evento: imutáveis inclusive contra TRUNCATE. Datas histórica e de registro separadas; autoria da carga atribuída a Henrique, sem inventar gerente.
- confirmar_posicao_86: transação por chamada, trava por casa, chave idempotente, rejeita itens duplicados, outro estabelecimento, retroatividade fora de ordem e 85 em produto. Lista completa produz retornos explícitos; parcial só afeta itens citados. Lista completa vazia encerra 85 e 86; para preservar alertas, enviá-los na lista completa.
- posicao_86_atual: uma linha por casa cadastrada no modelo, itens abertos, totais 85/86, última confirmação completa e validade. posicao_86_resumo_em(timestamp) usa o mesmo cálculo para consultas históricas.
- Mais de 6h desde a confirmação completa = desatualizado. Parcial não renova confirmação completa. Agora as quatro casas estão desatualizadas, corretamente: última confirmação 26/10 às 11h. As listas históricas não são confirmação do dia atual.
- Acesso apenas service_role; anon/authenticated sem grants ou políticas. Nenhuma rota Next.js criada nesta fase; nenhum basePath alterado.
- Aceites executados em PostgreSQL 17 local e no Supabase: supabase/tests/posicao_86_aceite.sql.
- Regras executadas em banco local isolado, com rollback: supabase/tests/posicao_86_regras.sql (replay, parcial, silêncio, lista zero, consulta histórica, imutabilidade, 85 e retroatividade).
- Evidências completas: f1-posicao-86-evidencias.json. A carga está em supabase/tests/posicao_86_oraculos.sql e usa transação única.

## Limite da fase

F2 não iniciada: fila legada e views antigas preservadas. F3 não iniciada: painéis ainda não foram migrados para a nova fonte. Não houve deploy. A F1 disponibiliza e valida a fonte única; o site publicado ainda pode mostrar os números antigos até a migração dos consumidores.
