const menuToggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.menu');
const dropdown = document.querySelector('.dropdown');
const dropdownToggle = document.querySelector('.dropdown-toggle');

function isMobileMenu() {
  return window.matchMedia('(max-width: 760px)').matches;
}

menuToggle?.addEventListener('click', () => {
  menu?.classList.toggle('open');
});

dropdownToggle?.addEventListener('click', (e) => {
  if (isMobileMenu()) {
    e.preventDefault();
    e.stopPropagation();
    dropdown?.classList.toggle('open');
  }
});

menu?.querySelectorAll('a').forEach((a) => {
  a.addEventListener('click', () => {
    menu.classList.remove('open');
    dropdown?.classList.remove('open');
  });
});

window.addEventListener('resize', () => {
  if (!isMobileMenu()) {
    menu?.classList.remove('open');
    dropdown?.classList.remove('open');
  }
});

const WHATSAPP = '5521970257379';

function trackAction(type) {
  if (window.idealTrack) window.idealTrack(type);
}

document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').forEach((link) => {
  link.addEventListener('click', () => trackAction('whatsapp'));
});

document.getElementById('quoteForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  trackAction('orcamento');
  const data = Object.fromEntries(new FormData(e.currentTarget).entries());
  const texto = `Olá! Gostaria de fazer um orçamento pelo site da Ideal Toldos.%0A%0A` +
    `Nome: ${data.nome || '-'}%0A` +
    `Bairro: ${data.bairro || '-'}%0A` +
    `Serviço: ${data.servico || '-'}%0A` +
    `Medidas: ${data.largura || '-'}m x ${data.altura || '-'}m%0A` +
    `Observação: ${data.obs || '-'}`;
  window.open(`https://wa.me/${WHATSAPP}?text=${texto}`, '_blank');
});



async function saveClientLead(data) {
  const payload = {
    nome: data.nome || data.name || '',
    telefone: data.telefone || data.whatsapp || '',
    bairro: data.bairro || '',
    servico: data.servico || '',
    observacao: data.observacao || data.obs || ''
  };

  const res = await fetch('/api/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.message || 'Erro ao cadastrar cliente.');
  }
  return json;
}

document.getElementById('clientForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const status = document.getElementById('clientFormStatus');
  const data = Object.fromEntries(new FormData(form).entries());

  try {
    trackAction('cadastro_cliente');
    await saveClientLead(data);
    if (status) {
      status.textContent = 'Cliente cadastrado com sucesso. Vamos entrar em contato.';
      status.className = 'client-form-status ok';
    }
    form.reset();
  } catch (err) {
    if (status) {
      status.textContent = err.message || 'Erro ao cadastrar cliente.';
      status.className = 'client-form-status error';
    }
  }
});

