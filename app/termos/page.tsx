import type { Metadata } from "next"
import Link from "next/link"

import { LegalPage, LegalSection, PendingLegalData, PrivacyEmailLink } from "@/components/legal/legal-page"
import { TERMS_VERSION } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Condições de uso da plataforma de agendamento MARCAÍ.",
}

const privacyLink = (
  <Link href="/privacidade" className="font-medium text-brand-light underline-offset-4 hover:underline">
    Política de Privacidade
  </Link>
)

export default function TermosPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      version={TERMS_VERSION}
      intro={
        <p>
          Estes termos regulam o uso da plataforma MARCAÍ por estabelecimentos e suas equipes. Ao criar uma conta, você declara
          que leu e aceitou estes termos e a {privacyLink}.
        </p>
      }
    >
      <LegalSection id="partes" title="1. Sobre a MARCAÍ">
        <p>
          A MARCAÍ é uma plataforma online de agendamento e gestão para estabelecimentos. A empresa responsável ainda não está
          formalmente constituída. Os dados jurídicos serão publicados aqui assim que existirem:
        </p>
        <ul>
          <li>Razão social: <PendingLegalData>a definir</PendingLegalData></li>
          <li>CNPJ: <PendingLegalData>a definir</PendingLegalData></li>
          <li>Endereço: <PendingLegalData>a definir</PendingLegalData></li>
        </ul>
        <p>Contato: <PrivacyEmailLink />.</p>
      </LegalSection>

      <LegalSection id="servico" title="2. O serviço">
        <p>A plataforma permite ao estabelecimento:</p>
        <ul>
          <li>publicar uma página de agendamento online para os seus clientes;</li>
          <li>gerenciar agenda, serviços, profissionais, clientes, atendimentos e pagamentos;</li>
          <li>convidar membros da equipe com papéis e permissões;</li>
          <li>receber avisos de agendamentos por WhatsApp e por notificações push.</li>
        </ul>
        <p>
          O serviço é oferecido no estado em que se encontra e pode mudar, ganhar ou perder funcionalidades. Não garantimos que
          ele funcionará sem interrupções ou erros.
        </p>
      </LegalSection>

      <LegalSection id="conta" title="3. Conta e acesso">
        <ul>
          <li>Você deve informar dados verdadeiros e mantê-los atualizados.</li>
          <li>
            Você é responsável por manter a senha em sigilo e pelas ações feitas com a sua conta e pelos membros que convidar.
          </li>
          <li>O proprietário define quem tem acesso ao estabelecimento e quais permissões cada membro recebe.</li>
        </ul>
      </LegalSection>

      <LegalSection id="clientes" title="4. Dados dos clientes do estabelecimento">
        <p>
          O estabelecimento é o responsável pelos dados pessoais dos seus clientes finais, inclusive os coletados pela página de
          agendamento. A MARCAÍ processa esses dados em nome do estabelecimento, apenas para prestar o serviço.
        </p>
        <p>Ao usar a plataforma, o estabelecimento se compromete a:</p>
        <ul>
          <li>ter uma base legal adequada para tratar os dados dos seus clientes;</li>
          <li>atender os pedidos dos seus clientes sobre os dados deles, como acesso, correção e exclusão;</li>
          <li>
            registrar apenas o necessário para o atendimento e não incluir, em observações, informações de saúde, documentos ou
            outros dados sensíveis ou desnecessários;
          </li>
          <li>
            saber que nome do cliente, serviço e dados do agendamento podem ser enviados ao WhatsApp e às notificações push do
            estabelecimento, quando esses avisos estiverem ativados.
          </li>
        </ul>
        <p>Os detalhes estão na {privacyLink}.</p>
      </LegalSection>

      <LegalSection id="assinatura" title="5. Assinatura e cobrança">
        <ul>
          <li>O uso do painel depende de uma assinatura ativa, conforme o plano escolhido.</li>
          <li>
            A cobrança é feita pelo Asaas. Para emiti-la, enviamos ao Asaas nome, CPF ou CNPJ, e-mail e telefone. Dados de cartão
            são informados diretamente na fatura do Asaas e não passam pela MARCAÍ.
          </li>
          <li>Se o pagamento não for feito, o acesso ao painel pode ser bloqueado.</li>
          <li>
            O cancelamento da assinatura bloqueia o acesso ao painel, mas não apaga os dados. Para pedir a exclusão, escreva para{" "}
            <PrivacyEmailLink />.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="uso" title="6. Uso aceitável">
        <p>Não é permitido:</p>
        <ul>
          <li>usar a plataforma para atividades ilegais ou para enviar conteúdo enganoso ou ofensivo;</li>
          <li>tentar acessar dados de outros estabelecimentos ou contornar limites e controles de segurança;</li>
          <li>fazer agendamentos falsos ou em massa;</li>
          <li>cadastrar dados de terceiros sem uma base legal adequada.</li>
        </ul>
        <p>Podemos suspender contas que violem estes termos.</p>
      </LegalSection>

      <LegalSection id="responsabilidade" title="7. Responsabilidades">
        <ul>
          <li>O estabelecimento é responsável pelos serviços que presta aos seus clientes e pelas informações que publica.</li>
          <li>
            A MARCAÍ não é parte da relação entre o estabelecimento e seus clientes, inclusive quanto a preços, atendimento,
            faltas e cancelamentos.
          </li>
          <li>
            Os avisos por WhatsApp e push dependem de serviços de terceiros e podem atrasar ou falhar. Confira sempre a agenda no
            painel.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="alteracoes" title="8. Alterações destes termos">
        <p>
          Podemos atualizar estes termos. A versão e a data da última atualização ficam no topo da página. Registramos a versão
          aceita no cadastro e, quando houver uma nova versão, pediremos um novo aceite.
        </p>
      </LegalSection>

      <LegalSection id="contato" title="9. Contato">
        <p>Dúvidas sobre estes termos ou sobre privacidade: <PrivacyEmailLink />.</p>
      </LegalSection>
    </LegalPage>
  )
}
