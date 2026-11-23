const router = require('./router');

const PERSON_KINDS = new Set(['order_lookup', 'account_action', 'exception_request', 'money', 'privacy']);
const CANNED_LANES = new Set(['money', 'privacy', 'shop', 'account']);
const ENGLISH_WORDS = new Set(['i', 'my', 'me', 'we', 'our', 'you', 'your', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'have', 'has', 'do', 'does', 'did', 'can', 'could', 'would', 'what', 'where', 'how', 'why', 'please', 'want', 'need', 'to', 'for', 'with', 'this', 'that', 'from']);
const OTHER_LANGUAGE_WORDS = /\b(?:quiero|necesito|reembolso|pedido|factura|donde|como|quero|preciso|meu|minha|obrigado|ich|mein|meine|bitte|rechnung|kann|sipari[sş]|iade|nas[iı]l|merhaba|mujhe|mera|meri|kya|kaise|chahiye|hai|nahi|merci|gracias)\b/i;

function skipPlannerForCanned(route, question) {
  if (!CANNED_LANES.has(route?.lane) || route?.responseMode === 'grounded') return false;
  const text = String(question || '');
  if (/[^\x00-\x7F]/.test(text) || OTHER_LANGUAGE_WORDS.test(text)) return false;
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  return words.filter((word) => ENGLISH_WORDS.has(word)).length >= 2;
}

function isPlainAcknowledgment(question) {
  const text = String(question || '').trim();
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  if (!words.length || words.length > 8 || /[?？\n\r]/.test(text)) return false;
  // A missing question mark is common in support requests. A model's
  // "acknowledgment" label cannot override these question/problem cues.
  if (/^(?:has|is|did|does|can|when|why|how|what)\b/i.test(text) ||
      /\b(?:when|why|how|what|not|still|again|now|empty|error|broken|issue|another|but|however|except|yet|missing|failed|failing|stuck|stopped|vanished|lost|cannot|can't|won't|want|need|please|refund|cancel|delete|replace|help)\b/i.test(text)) return false;
  return /\b(?:thanks|thank you|gracias|merci|obrigad[oa]|danke|grazie|fixed|resolved|works|working|ok|okay|yes|yeah|great|perfect|understood|got it|all good)\b/i.test(text) ||
    /(?:ありがとう|ありがとうございます|谢谢|謝謝|감사합니다|고마워요)/u.test(text);
}

function suppressOffTopic(understanding, route) {
  return understanding?.messageKind === 'off_topic' &&
    understanding?.wantsPerson !== true &&
    !route?.wantHuman && !route?.escalate &&
    !CANNED_LANES.has(route?.lane) && !router.isTechLane(route);
}

function personKind(understanding) {
  const kind = String(understanding?.supportKind || '').trim();
  return PERSON_KINDS.has(kind) ? kind : '';
}

function routeWithUnderstanding(route, understanding, originalQuestion = '') {
  const base = route || { area: 'unknown', lane: 'unknown' };
  const current = understanding?.wantsPerson === true
    ? { ...base, wantHuman: true, escalate: true }
    : base;
  const kind = String(understanding?.supportKind || '').trim();
  const translated = router.classify(understanding?.standaloneQuestion || '');
  const explicit = router.classify(originalQuestion);
  if (explicit.lane === 'money' || explicit.lane === 'privacy') {
    return { ...current, ...explicit, escalate: true, wantHuman: current.wantHuman || explicit.wantHuman };
  }
  // A checkout quote needs a human decision, but it is not a tracking lookup.
  if (current.intent === 'shipping_quote') return current;
  if (kind === 'order_lookup') {
    return { ...current, area: 'shop', lane: 'shop', escalate: true };
  }
  if (kind === 'account_action') {
    const privacy = current.lane === 'privacy' || translated.lane === 'privacy';
    return { ...current, area: privacy ? 'privacy' : 'shop', lane: privacy ? 'privacy' : 'account', escalate: true };
  }
  if (kind === 'exception_request') {
    const money = current.lane === 'money' || translated.lane === 'money';
    return { ...current, area: 'shop', lane: money ? 'money' : 'shop', escalate: true };
  }
  if (kind === 'money') return { ...current, area: 'shop', lane: 'money', escalate: true };
  if (kind === 'privacy') return { ...current, area: 'privacy', lane: 'privacy', escalate: true };
  const reportedFault = /\b(?:empty|missing|vanished|lost|stopped|failed|failing|broken|error|crash(?:ed|ing)?|doesn['’]?t|won['’]?t|cannot|can['’]?t|not working|not syncing|no answer)\b/i.test(String(originalQuestion || ''));
  const inheritedCommercial = ['money', 'privacy', 'shop', 'account'].includes(current.lane) &&
    explicit.lane === 'unknown';
  const weakRoute = inheritedCommercial || current.lane === 'unknown' ||
    (current.lane === 'faq' && current.area === 'unknown' &&
      (router.isTechLane(translated) || understanding?.messageKind === 'new_symptom' || reportedFault) &&
      !router.looksLikeProductQuestion(originalQuestion));
  if (kind === 'technical_problem' && weakRoute) {
    const area = ['app', 'desktop', 'firmware'].includes(translated.area) ? translated.area : 'unknown';
    return { ...current, area, lane: area === 'firmware' ? 'firmware' : 'tech', escalate: true };
  }
  return current;
}

function suppressAcknowledgment(_understanding, question) {
  return isPlainAcknowledgment(question);
}

const LOCALIZED_HANDOFF = {
  es: { accepted: "Una persona del equipo de soporte ha aceptado tu solicitud para revisarla. Continúa en este hilo.", unconfirmed: "El envío al equipo de soporte no está confirmado. Continúa en este hilo.", pending: 'Una persona del equipo debe revisar esto.', thread: "Tu solicitud se ha enviado al equipo de soporte para su revisión. Continúa en este hilo.", sent: "Tu solicitud se ha enviado al equipo de soporte para su revisión.", failed: 'No pude entregar el caso al equipo. Escribe a help@omi.me en privado.', duplicate: "Tu solicitud ya se había enviado al equipo de soporte para su revisión.", issue: 'El problema está registrado en este hilo.' },
  pt: { accepted: "Uma pessoa da equipe de suporte aceitou sua solicitação para análise. Continue nesta conversa.", unconfirmed: "O envio à equipe de suporte não está confirmado. Continue nesta conversa.", pending: 'Uma pessoa da equipe precisa analisar isso.', thread: "Sua solicitação foi enviada à equipe de suporte para análise. Continue nesta conversa.", sent: "Sua solicitação foi enviada à equipe de suporte para análise.", failed: 'Não consegui enviar o caso à equipe. Escreva para help@omi.me em privado.', duplicate: "Sua solicitação já havia sido enviada à equipe de suporte para análise.", issue: 'O problema está registrado nesta conversa.' },
  de: { accepted: "Ein Mitglied des Support-Teams hat deine Anfrage zur Prüfung angenommen. Bitte bleibe in diesem Thread.", unconfirmed: "Die Übermittlung an das Support-Team ist nicht bestätigt. Bitte bleibe in diesem Thread.", pending: 'Jemand aus dem Team muss das prüfen.', thread: "Deine Anfrage wurde zur Prüfung an das Support-Team gesendet. Bitte bleibe in diesem Thread.", sent: "Deine Anfrage wurde zur Prüfung an das Support-Team gesendet.", failed: 'Ich konnte den Fall nicht an das Team weiterleiten. Bitte schreibe privat an help@omi.me.', duplicate: "Deine Anfrage wurde bereits zur Prüfung an das Support-Team gesendet.", issue: 'Das Problem ist in diesem Thread festgehalten.' },
  tr: { accepted: "Destek ekibinden bir kişi talebinizi incelemek üzere kabul etti. Lütfen bu başlıkta devam edin.", unconfirmed: "Talebin destek ekibine iletildiği doğrulanamadı. Lütfen bu başlıkta devam edin.", pending: 'Ekipten birinin bunu incelemesi gerekiyor.', thread: "Talebiniz incelenmek üzere destek ekibine gönderildi. Lütfen bu başlıkta devam edin.", sent: "Talebiniz incelenmek üzere destek ekibine gönderildi.", failed: 'Talebi ekibe iletemedim. Lütfen help@omi.me adresine özel olarak yazın.', duplicate: "Talebiniz daha önce incelenmek üzere destek ekibine gönderildi.", issue: 'Sorun bu başlıkta kayıtlı.' },
  fr: { accepted: "Une personne de l’équipe de support a accepté votre demande pour examen. Veuillez continuer dans ce fil.", unconfirmed: "L’envoi à l’équipe de support n’est pas confirmé. Veuillez continuer dans ce fil.", pending: "Une personne de l'équipe doit examiner cela.", thread: "Votre demande a été envoyée à l’équipe de support pour examen. Veuillez continuer dans ce fil.", sent: "Votre demande a été envoyée à l’équipe de support pour examen.", failed: "Je n'ai pas pu transmettre le dossier à l'équipe. Écrivez à help@omi.me en privé.", duplicate: "Votre demande avait déjà été envoyée à l’équipe de support pour examen.", issue: 'Le problème est consigné dans ce fil.' },
  id: { accepted: "Seseorang dari tim dukungan telah menerima permintaanmu untuk ditinjau. Silakan lanjutkan di utas ini.", unconfirmed: "Pengiriman ke tim dukungan belum terkonfirmasi. Silakan lanjutkan di utas ini.", pending: 'Seseorang dari tim perlu meninjau ini.', thread: "Permintaanmu telah dikirim ke tim dukungan untuk ditinjau. Silakan lanjutkan di utas ini.", sent: "Permintaanmu telah dikirim ke tim dukungan untuk ditinjau.", failed: 'Saya tidak dapat mengirim kasus ini ke tim. Silakan email help@omi.me secara pribadi.', duplicate: "Permintaanmu sudah pernah dikirim ke tim dukungan untuk ditinjau.", issue: 'Masalah ini tercatat di utas ini.' },
  'hi-Latn': { accepted: "Support team ke ek sadasya ne aapka anurodh jaanch ke liye sweekar kiya hai. Kripya isi thread mein baat jaari rakhein.", unconfirmed: "Support team tak anurodh pahunchne ki pushti nahi hui hai. Kripya isi thread mein baat jaari rakhein.", pending: 'Team ke kisi vyakti ko iski jaanch karni hogi.', thread: "Aapka anurodh jaanch ke liye support team ko bheja gaya hai. Kripya isi thread mein baat jaari rakhein.", sent: "Aapka anurodh jaanch ke liye support team ko bheja gaya hai.", failed: 'Main yeh mamla team tak nahi pahuncha saka. Kripya help@omi.me par private email karein.', duplicate: "Aapka anurodh jaanch ke liye support team ko pehle hi bheja gaya tha.", issue: 'Yeh samasya isi thread mein darj hai.' },
  'hi-Deva': { accepted: "सहायता टीम के एक सदस्य ने आपका अनुरोध समीक्षा के लिए स्वीकार किया है। कृपया इसी थ्रेड में बातचीत जारी रखें।", unconfirmed: "सहायता टीम तक अनुरोध पहुँचने की पुष्टि नहीं हुई है। कृपया इसी थ्रेड में बातचीत जारी रखें।", pending: 'टीम के किसी व्यक्ति को इसकी जाँच करनी होगी।', thread: "आपका अनुरोध समीक्षा के लिए सहायता टीम को भेज दिया गया है। कृपया इसी थ्रेड में बातचीत जारी रखें।", sent: "आपका अनुरोध समीक्षा के लिए सहायता टीम को भेज दिया गया है।", failed: 'मैं यह मामला टीम तक नहीं पहुँचा सका। कृपया help@omi.me पर निजी ईमेल करें।', duplicate: "आपका अनुरोध समीक्षा के लिए सहायता टीम को पहले ही भेजा गया था।", issue: 'यह समस्या इसी थ्रेड में दर्ज है।' },
  ja: { accepted: "サポートチームの担当者がご依頼の確認を引き受けました。 引き続きこのスレッドをご利用ください。", unconfirmed: "サポートチームへの送信は確認できていません。引き続きこのスレッドをご利用ください。", pending: '担当者による確認が必要です。', thread: "ご依頼を確認のためサポートチームに送信しました。 引き続きこのスレッドをご利用ください。", sent: "ご依頼を確認のためサポートチームに送信しました。", failed: '担当者に届けられませんでした。詳細を help@omi.me に非公開でメールしてください。', duplicate: "ご依頼はすでに確認のためサポートチームに送信されています。", issue: '問題はこのスレッドに記録されています。' },
  zh: { accepted: "支持团队的一位成员已接受您的请求进行审核。 请继续使用这个讨论串。", unconfirmed: "尚未确认请求已发送给支持团队。请继续使用这个讨论串。", pending: '需要支持团队的工作人员查看这个请求。', thread: "您的请求已发送给支持团队审核。 请继续使用这个讨论串。", sent: "您的请求已发送给支持团队审核。", failed: '未能将您的请求发送给支持团队。请通过私密邮件联系 help@omi.me。', duplicate: "您的请求此前已发送给支持团队审核。", issue: '问题已记录在这个讨论串中。' },
  it: { accepted: "Una persona del team di supporto ha accettato la tua richiesta per una verifica. Continua in questa conversazione.", unconfirmed: "L’invio al team di supporto non è confermato. Continua in questa conversazione.", pending: 'Una persona del team deve esaminare questa richiesta.', thread: "La tua richiesta è stata inviata al team di supporto per una verifica. Continua in questa conversazione.", sent: "La tua richiesta è stata inviata al team di supporto per una verifica.", failed: 'Non ho potuto inviare la richiesta al team. Scrivi a help@omi.me in privato.', duplicate: "La tua richiesta era già stata inviata al team di supporto per una verifica.", issue: 'Il problema è registrato in questa conversazione.' },
};

function handoffLocale(understanding, question) {
  const language = String(understanding?.replyLanguage || 'en').toLowerCase().split('-')[0];
  if (language === 'hi') return LOCALIZED_HANDOFF[/\p{Script=Devanagari}/u.test(String(question || '')) ? 'hi-Deva' : 'hi-Latn'];
  return LOCALIZED_HANDOFF[language] || null;
}

function handoffFooters(understanding, question) {
  const language = String(understanding?.replyLanguage || 'en').toLowerCase().split('-')[0];
  if (language === 'en') return null;
  const locale = handoffLocale(understanding, question);
  if (!locale) return null;
  return {
    thread: locale.thread || '', sent: locale.sent || '', failed: locale.failed || '',
    duplicate: locale.duplicate || '', pending: locale.pending || '', issue: locale.issue || '',
    accepted: locale.accepted || '', unconfirmed: locale.unconfirmed || '',
  };
}

function safeHandoffAcknowledgment(understanding, question) {
  const language = String(understanding?.replyLanguage || '').toLowerCase();
  const acknowledgment = String(understanding?.handoffAcknowledgment || '').trim();
  if (!language || language === 'en' || !acknowledgment || acknowledgment.length > 220) return '';
  if (/[\d@#€$£₹<>\n\r]|https?:\/\//i.test(acknowledgment)) return '';
  if (!/\p{Script=Devanagari}/u.test(String(question || '')) &&
      /\p{Script=Devanagari}/u.test(acknowledgment)) return '';
  return acknowledgment;
}

function personReply(kind, route, question, understanding) {
  if (route?.intent === 'shipping_quote') return router.cannedReply(route, question);
  const acknowledgment = safeHandoffAcknowledgment(understanding, question);
  if (String(understanding?.replyLanguage || 'en').toLowerCase().split('-')[0] !== 'en') {
    const localized = acknowledgment || handoffLocale(understanding, question)?.pending;
    if (localized) return localized;
  }
  let reply;
  if (kind === 'order_lookup') {
    reply = router.cannedReply({ ...route, area: 'shop', lane: 'shop' }, question);
  } else if (kind === 'account_action') {
    reply = route?.lane === 'privacy'
      ? router.cannedReply(route, question)
      : router.cannedReply({ ...route, lane: 'account' }, question);
  } else if (kind === 'privacy') {
    reply = router.cannedReply({ ...route, lane: 'privacy' }, question);
  } else if (kind === 'money') {
    reply = router.cannedReply({ ...route, lane: 'money' }, question);
  } else if (route?.wantHuman) {
    reply = 'A person needs to review your request.';
  } else if (route?.lane === 'money') {
    reply = router.cannedReply(route, question);
  } else if (/\b(?:replacement|warranty)\b/i.test(String(question || ''))) {
    reply = 'You need help with a replacement or warranty request. Coverage or a replacement needs a team review before it can be confirmed.';
  } else {
    reply = 'A person needs to review this request.';
  }
  return reply;
}

function isGroundedHowTo(route, question, answer) {
  if (route?.lane !== 'faq' || route?.wantHuman || !router.looksLikeProductQuestion(question)) return false;
  const text = String(answer || '');
  if (!/https:\/\/(?:help|docs)\.omi\.me\//i.test(text)) return false;
  const uncertainty = /\b(?:couldn['’]?t find|can['’]?t find|couldn['’]?t verify|could not verify|can['’]?t verify|cannot verify|not sure|can['’]?t confirm|unable to verify|don['’]?t know)\b/i.exec(text);
  const actionableStep = /\b(?:open|go to|tap|select|choose|press|connect|update|visit)\b/i.exec(text);
  if (uncertainty && (!actionableStep || uncertainty.index < actionableStep.index)) return false;
  return true;
}

function verifiedCannedReply(route, question, evidence) {
  if (route?.lane !== 'faq' || route?.wantHuman || route?.escalate ||
      !router.looksLikeProductQuestion(question)) return '';
  const reply = String(router.cannedReply(route, question) || '');
  const cited = /\bSource:\s*(https:\/\/(?:help|docs)\.omi\.me\/[^\s)]+)/i.exec(reply);
  if (!cited) return '';
  const normalize = (url) => String(url || '').replace(/\.md\/?$/i, '').replace(/\/$/, '');
  const source = normalize(cited[1]);
  const block = String(evidence || '').split(/(?=\[S\d+\s*\|)/).find((part) =>
    [...part.matchAll(/https:\/\/(?:help|docs)\.omi\.me\/[^\s)]+/gi)]
      .some((match) => normalize(match[0]) === source));
  if (!block) return '';
  const numbers = (reply.slice(0, cited.index).match(/\b\d+\b/g) || []);
  if (numbers.some((number) => !new RegExp(`\\b${number}\\b`).test(block))) return '';
  return reply;
}

function personReason(kind) {
  if (kind === 'order_lookup') return 'Order lookup requires a verified staff check';
  if (kind === 'account_action') return 'Account or data action requires staff access';
  return 'Exception request requires staff review';
}

module.exports = { personKind, routeWithUnderstanding, skipPlannerForCanned, suppressAcknowledgment, suppressOffTopic, personReply, personReason, handoffFooters, isGroundedHowTo, verifiedCannedReply };
