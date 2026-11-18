import type { Metadata } from "next"

import { LegalPage, LegalSection, PendingLegalData, PrivacyEmailLink } from "@/components/legal/legal-page"
import { PRIVACY_VERSION } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como a MARCAÍ coleta, usa, armazena e compartilha dados pessoais.",
}

export default function PrivacidadePage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      version={PRIVACY_VERSION}
      intro={
        <p>
          Esta política descreve como a MARCAÍ trata dados pessoais na plataforma de agendamento online. Ela reflete as práticas
          atuais do serviço, inclusive as que ainda estão em desenvolvimento, e será atualizada quando essas práticas mudarem.
          Esta é a primeira versão do documento e ela não representa uma declaração de conformidade integral com a Lei Geral de
          Proteção de Dados (Lei 13.709/2018, LGPD).
        </p>
      }
    >
      <LegalSection id="quem-somos" title="1. Quem somos e como falar conosco">
        <p>
          A MARCAÍ é uma plataforma online de agendamento e gestão para estabelecimentos. A empresa responsável ainda não está
          formalmente constituída. Os dados jurídicos serão publicados aqui assim que existirem:
        </p>
        <ul>
          <li>Razão social: <PendingLegalData>a definir</PendingLegalData></li>
          <li>CNPJ: <PendingLegalData>a definir</PendingLegalData></li>
          <li>Endereço: <PendingLegalData>a definir</PendingLegalData></li>
        </ul>
        <p>
          Para qualquer questão sobre privacidade, inclusive o exercício dos seus direitos, escreva para <PrivacyEmailLink />.
          Este e-mail é o canal de comunicação com os titulares de dados.
        </p>
      </LegalSection>

      <LegalSection id="papeis" title="2. Quem é responsável por cada dado">
        <ul>
          <li>
            <strong>Dados de quem usa o painel</strong> (proprietários e membros da equipe dos estabelecimentos) e dados de
            cobrança da assinatura: a MARCAÍ decide como esses dados são tratados.
          </li>
          <li>
            <strong>Dados dos clientes finais</strong> (pessoas que agendam um horário): o estabelecimento é o responsável por
            esses dados. A MARCAÍ os processa em nome do estabelecimento, apenas para prestar o serviço de agendamento e gestão.
          </li>
        </ul>
        <p>
          Se você é cliente de um estabelecimento e quer acessar, corrigir ou excluir seus dados, procure primeiro o próprio
          estabelecimento. Você também pode escrever para <PrivacyEmailLink /> e encaminharemos o pedido.
        </p>
      </LegalSection>

      <LegalSection id="dados" title="3. Quais dados coletamos">
        <p><strong>Proprietários e equipe</strong></p>
        <ul>
          <li>Nome, e-mail, número de WhatsApp e senha (guardada apenas na forma de hash, nunca em texto).</li>
          <li>Vínculo com o estabelecimento, papel e permissões; e-mail de pessoas convidadas para a equipe.</li>
          <li>Preferências de notificação e, se você ativar, os dados técnicos da assinatura de notificações push do navegador.</li>
          <li>Número de WhatsApp para receber avisos de agendamentos e a data em que você autorizou esses avisos.</li>
          <li>Endereço IP e identificação do navegador (user-agent) registrados nas sessões de login.</li>
        </ul>
        <p><strong>Estabelecimento</strong></p>
        <ul>
          <li>Nome, endereço de agendamento, segmento, telefone, endereço, descrição, horários, logo e capa.</li>
          <li>Profissionais cadastrados: nome, foto, telefone, e-mail, especialidades e jornada.</li>
        </ul>
        <p><strong>Clientes finais</strong></p>
        <ul>
          <li>
            No agendamento online: nome, WhatsApp, observações (até 500 caracteres), serviço, profissional, data e horário.
            Não pedimos e-mail nem CPF nessa etapa.
          </li>
          <li>Quando o estabelecimento cadastra o cliente no painel: também e-mail, data de nascimento e observações.</li>
          <li>Histórico de agendamentos, valores e formas de pagamento registrados pelo estabelecimento.</li>
        </ul>
        <p><strong>Cobrança da assinatura</strong></p>
        <ul>
          <li>
            CPF ou CNPJ, nome, e-mail e telefone informados na contratação. O CPF ou CNPJ é enviado ao processador de pagamentos
            e não é gravado no banco de dados da MARCAÍ. Dados de cartão não passam pela MARCAÍ: o pagamento é feito na fatura
            do processador.
          </li>
          <li>Plano, status, histórico e valores das cobranças, e os eventos enviados pelo processador de pagamentos.</li>
        </ul>
        <p><strong>Dados técnicos</strong></p>
        <ul>
          <li>Endereço IP e, no agendamento online, o número de WhatsApp informado, usados para limitar tentativas repetidas.</li>
          <li>Registros técnicos (logs) de acesso mantidos pelo provedor de hospedagem.</li>
        </ul>
      </LegalSection>

      <LegalSection id="finalidades" title="4. Para que usamos os dados">
        <ul>
          <li>Criar e proteger sua conta, permitir o login e a recuperação de acesso.</li>
          <li>Montar a página pública de agendamento, a agenda e a disponibilidade dos profissionais.</li>
          <li>Registrar agendamentos, clientes, atendimentos e pagamentos em nome do estabelecimento.</li>
          <li>Avisar o estabelecimento sobre novos agendamentos, cancelamentos e reagendamentos.</li>
          <li>Cobrar a assinatura da plataforma.</li>
          <li>Prevenir abusos, como tentativas repetidas de login, cadastro ou agendamento.</li>
          <li>Registrar ações administrativas na plataforma, para responsabilização e segurança.</li>
        </ul>
      </LegalSection>

      <LegalSection id="notificacoes" title="5. Notificações ao estabelecimento">
        <p>
          Quando um cliente agenda, cancela ou reagenda, o <strong>nome do cliente, o serviço e os dados do agendamento</strong>{" "}
          (profissional, data e horário) podem ser enviados:
        </p>
        <ul>
          <li>ao WhatsApp do estabelecimento, pela API oficial do WhatsApp (Meta), se o estabelecimento ativou esses avisos;</li>
          <li>
            às notificações push dos navegadores da equipe do estabelecimento, que passam pelos serviços de push dos navegadores
            (como Google, Mozilla e Apple).
          </li>
        </ul>
        <p>A MARCAÍ não envia mensagens de WhatsApp para os clientes finais.</p>
      </LegalSection>

      <LegalSection id="compartilhamento" title="6. Com quem compartilhamos">
        <p>Não vendemos dados pessoais. Compartilhamos dados apenas com os fornecedores necessários para o serviço funcionar:</p>
        <ul>
          <li><strong>Vercel</strong>: hospedagem da aplicação e registros técnicos de acesso.</li>
          <li><strong>Neon</strong>: banco de dados PostgreSQL onde os dados da plataforma ficam armazenados.</li>
          <li>
            <strong>Asaas</strong>: processamento da cobrança da assinatura (nome, CPF ou CNPJ, e-mail, telefone, plano e valor).
          </li>
          <li>
            <strong>Resend</strong>: envio de e-mails da conta, como redefinição de senha, verificação, troca de e-mail e convites.
          </li>
          <li><strong>Meta (WhatsApp Cloud API)</strong>: avisos ao estabelecimento, conforme a seção 5.</li>
          <li><strong>Serviços de push dos navegadores</strong>: entrega das notificações push, conforme a seção 5.</li>
        </ul>
        <p>
          Alguns desses fornecedores são empresas estrangeiras, o que pode envolver a transferência de dados para fora do Brasil.
          Também podemos compartilhar dados quando exigido por lei ou por ordem de autoridade competente.
        </p>
        <p>
          Não usamos ferramentas de analytics, pixels de publicidade ou rastreamento de terceiros no código da plataforma.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="7. Cookies">
        <p>Usamos apenas cookies necessários para o funcionamento da plataforma:</p>
        <ul>
          <li>cookie de sessão, que mantém você conectado por até 30 dias e é renovado com o uso;</li>
          <li>cookie que lembra qual estabelecimento está ativo no painel, válido por até 1 ano.</li>
        </ul>
      </LegalSection>

      <LegalSection id="seguranca" title="8. Como protegemos os dados">
        <p>Estas são as medidas que existem hoje. Nenhum sistema é imune a incidentes e não oferecemos garantia de segurança absoluta.</p>
        <ul>
          <li>Senhas guardadas com hash; tokens de convite guardados apenas em hash.</li>
          <li>Conexão com o banco de dados criptografada.</li>
          <li>Cada estabelecimento só acessa os próprios dados, conforme o papel e as permissões de cada membro da equipe.</li>
          <li>Limites de tentativas em login, cadastro, recuperação de senha e agendamento online.</li>
          <li>Credenciais de fornecedores mantidas fora do código-fonte.</li>
        </ul>
      </LegalSection>

      <LegalSection id="retencao" title="9. Por quanto tempo guardamos">
        <p>
          Ainda não definimos prazos de retenção e não existe hoje uma rotina automática de exclusão. Na prática, os dados
          permanecem armazenados enquanto a conta e o estabelecimento existirem, inclusive depois do cancelamento da assinatura:
          o cancelamento bloqueia o acesso ao painel, mas não apaga os dados.
        </p>
        <p>
          Quando os prazos forem definidos, esta política será atualizada. Até lá, você pode pedir a exclusão pelo e-mail{" "}
          <PrivacyEmailLink />, e ela será tratada manualmente, observadas as obrigações legais de guarda.
        </p>
      </LegalSection>

      <LegalSection id="direitos" title="10. Seus direitos">
        <p>
          A LGPD garante ao titular, entre outros, os direitos de confirmar a existência de tratamento, acessar, corrigir,
          solicitar a exclusão ou anonimização, solicitar a portabilidade e obter informações sobre compartilhamento.
        </p>
        <ul>
          <li>Proprietários e membros da equipe podem corrigir nome, telefone, e-mail e senha diretamente nas configurações da conta.</li>
          <li>O estabelecimento pode corrigir e excluir os dados dos próprios clientes no painel.</li>
          <li>
            A plataforma ainda não oferece exclusão da própria conta nem exportação de dados por conta própria. Esses pedidos devem
            ser feitos pelo e-mail <PrivacyEmailLink />.
          </li>
        </ul>
        <p>Para confirmar a sua identidade, podemos pedir informações adicionais antes de atender a solicitação.</p>
      </LegalSection>

      <LegalSection id="observacoes" title="11. Cuidados com o campo de observações">
        <p>
          O campo de observações do agendamento deve conter apenas o necessário para o atendimento. Não inclua informações de
          saúde, documentos, dados financeiros ou outros dados sensíveis ou desnecessários.
        </p>
      </LegalSection>

      <LegalSection id="alteracoes" title="12. Alterações desta política">
        <p>
          Podemos atualizar esta política. A versão e a data da última atualização ficam no topo da página. Quando houver uma
          nova versão, pediremos um novo aceite no cadastro.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
