const app = document.getElementById('app');

const STORAGE_KEY = 'facadeSurveyDataV1';
const NAME_KEY = 'facadeSurveyUserName';
const DEFAULT_DISCLAIMER =
  'Расчёт предварительный (бюджетный). Точная стоимость после проектирования/уточняющих замеров/КМ/КМД. Возможны изменения объёмов и узлов.';

const state = {
  userName: localStorage.getItem(NAME_KEY) || '',
  data: loadData(),
  current: { view: 'start' },
  autosaveId: null,
};

const facadeCodeOptions = ['A', 'B', 'C', 'Север', 'Юг', 'Восток', 'Запад'];
const categories = [
  { key: 'overview', label: 'Общий вид' },
  { key: 'facade_whole', label: 'Фасад целиком' },
  { key: 'node', label: 'Узел/примыкание' },
  { key: 'base', label: 'Основание' },
  { key: 'access', label: 'Доступ' },
  { key: 'other', label: 'Прочее' },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { projects: [] };
  } catch {
    return { projects: [] };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function formatDate(d = new Date()) {
  return new Date(d).toISOString().slice(0, 10);
}

function calcSurveyTotals(survey) {
  const gross = survey.facades.reduce((s, f) => s + Number(f.length || 0) * Number(f.height || 0), 0);
  const exclusion = survey.exclusions.reduce(
    (s, e) => s + Number(e.width || 0) * Number(e.height || 0) * Number(e.qty || 0),
    0,
  );
  const net = Math.max(gross - exclusion, 0);
  const reserve = survey.reserveEnabled ? net * (1 + Number(survey.reservePercent || 0) / 100) : net;
  return { gross, exclusion, net, reserve };
}

function getProject(id) {
  return state.data.projects.find((p) => p.id === id);
}

function getSurvey(project, surveyId) {
  return project.surveys.find((s) => s.id === surveyId);
}

function validateReady(survey) {
  const miss = [];
  const validFacades = survey.facades.filter((f) => Number(f.length) > 0 && Number(f.height) > 0);
  if (!validFacades.length) miss.push('Добавьте минимум 1 фасад с длиной и высотой.');
  if (!survey.foundationTypes.length) miss.push('Выберите хотя бы один тип основания/подсистемы.');
  if (!survey.accuracy) miss.push('Выберите точность замеров (±5/±10/±15).');
  if (survey.media.length < 10) miss.push('Загрузите минимум 10 фото/видео.');
  const overviewCount = survey.media.filter((m) => m.category === 'overview').length;
  if (overviewCount < 1) miss.push('Нужно минимум 1 фото категории «Общий вид».');
  const nodeCount = survey.media.filter((m) => m.category === 'node').length;
  if (nodeCount < 2) miss.push('Нужно минимум 2 фото категории «Узел/примыкание».');

  validFacades.forEach((f) => {
    const hasFacadePhoto = survey.media.some(
      (m) => m.category === 'facade_whole' && m.facadeCode === f.code,
    );
    if (!hasFacadePhoto) miss.push(`Нет фото «Фасад целиком» для фасада ${f.code}.`);
  });
  return miss;
}

function routeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const p = params.get('projectId');
  const s = params.get('surveyId');
  if (p && getProject(p)) {
    state.current = s ? { view: 'survey', projectId: p, surveyId: s, step: 0 } : { view: 'project', projectId: p };
  }
}

function setView(viewObj) {
  clearInterval(state.autosaveId);
  state.autosaveId = null;
  state.current = viewObj;
  render();
}

function setInner(html) {
  app.innerHTML = html;
}

function renderTopBar() {
  return state.userName
    ? `<div class="navbar"><span class="badge">Исполнитель: ${state.userName}</span><button class="secondary" id="changeNameBtn">Сменить имя</button></div>`
    : '';
}

function renderStart() {
  setInner(`
    <div class="card">
      <h1>Введите имя</h1>
      <p>Имя будет использовано как исполнитель обследования и попадёт в PDF.</p>
      <label>Ваше имя</label>
      <input id="nameInput" placeholder="Например: Иван Петров" value="${state.userName}" />
      <div class="row" style="margin-top:12px">
        <button id="saveNameBtn">Продолжить</button>
      </div>
    </div>
  `);
  document.getElementById('saveNameBtn').onclick = () => {
    const v = document.getElementById('nameInput').value.trim();
    if (!v) return alert('Введите имя.');
    state.userName = v;
    localStorage.setItem(NAME_KEY, v);
    setView({ view: 'dashboard' });
  };
}

function renderDashboard() {
  const statuses = ['Все', 'Черновик', 'Готово к расчёту', 'На уточнении'];
  const projects = state.data.projects;
  setInner(`
    ${renderTopBar()}
    <div class="card">
      <h1>Объекты</h1>
      <div class="grid two">
        <div><label>Поиск</label><input id="search" placeholder="Название или адрес" /></div>
        <div><label>Фильтр по статусу обследования</label><select id="statusFilter">${statuses
          .map((s) => `<option>${s}</option>`)
          .join('')}</select></div>
      </div>
      <div style="margin-top:10px"><button id="createProjectBtn">Создать объект</button></div>
    </div>
    <div id="projectList"></div>
  `);

  const drawList = () => {
    const q = document.getElementById('search').value.toLowerCase();
    const sf = document.getElementById('statusFilter').value;
    const filtered = projects.filter((p) => {
      const str = `${p.name} ${p.address}`.toLowerCase();
      const statusMatch =
        sf === 'Все' || p.surveys.some((s) => s.status === sf) || (sf === 'Черновик' && !p.surveys.length);
      return str.includes(q) && statusMatch;
    });
    document.getElementById('projectList').innerHTML = filtered
      .map(
        (p) => `<div class="card list-item">
      <div class="row"><div><h3>${p.name}</h3><p>${p.address}</p></div><div style="text-align:right"><span class="badge">${p.type}</span></div></div>
      <p class="small">Обследований: ${p.surveys.length} • Автор: ${p.author} • ${p.createdAt}</p>
      <div class="row"><button class="ghost" data-open="${p.id}">Открыть</button><button class="secondary" data-share="${p.id}">Поделиться ссылкой</button></div>
      </div>`,
      )
      .join('');

    document.querySelectorAll('[data-open]').forEach((el) => (el.onclick = () => setView({ view: 'project', projectId: el.dataset.open })));
    document.querySelectorAll('[data-share]').forEach((el) => {
      el.onclick = async () => {
        const url = `${location.origin}${location.pathname}?projectId=${el.dataset.share}`;
        await navigator.clipboard.writeText(url);
        alert('Ссылка на объект скопирована в буфер обмена.');
      };
    });
  };
  drawList();
  document.getElementById('search').oninput = drawList;
  document.getElementById('statusFilter').onchange = drawList;

  document.getElementById('createProjectBtn').onclick = () => {
    const project = {
      id: uid(),
      name: 'Новый объект',
      address: '',
      type: 'ТЦ',
      client: '',
      contact: '',
      createdAt: formatDate(),
      author: state.userName,
      surveys: [],
    };
    state.data.projects.unshift(project);
    saveData();
    setView({ view: 'project', projectId: project.id });
  };

  bindTopBar();
}

function bindTopBar() {
  const c = document.getElementById('changeNameBtn');
  if (c) c.onclick = () => setView({ view: 'start' });
}

function renderProject() {
  const project = getProject(state.current.projectId);
  if (!project) return setView({ view: 'dashboard' });
  setInner(`
    ${renderTopBar()}
    <div class="card">
      <div class="row"><button class="ghost" id="backDash">← К объектам</button><button class="secondary" id="shareProject">Поделиться ссылкой</button></div>
      <h2 style="margin-top:10px">Карточка объекта</h2>
      <div class="grid two">
        <div><label>Название</label><input id="pName" value="${project.name}" /></div>
        <div><label>Тип</label><select id="pType">${['ТЦ', 'БЦ', 'Склад', 'Другое']
          .map((t) => `<option ${project.type === t ? 'selected' : ''}>${t}</option>`)
          .join('')}</select></div>
        <div><label>Адрес</label><input id="pAddress" value="${project.address}" /></div>
        <div><label>Клиент (опционально)</label><input id="pClient" value="${project.client}" /></div>
        <div><label>Контакт (опционально)</label><input id="pContact" value="${project.contact}" /></div>
      </div>
      <div class="row" style="margin-top:10px"><button id="saveProject">Сохранить объект</button><button class="secondary" id="newSurveyBtn">Создать обследование</button></div>
    </div>
    <div class="card">
      <h3>Обследования</h3>
      <div id="surveyList"></div>
    </div>
  `);
  bindTopBar();
  document.getElementById('backDash').onclick = () => setView({ view: 'dashboard' });
  document.getElementById('shareProject').onclick = async () => {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}?projectId=${project.id}`);
    alert('Ссылка на объект скопирована.');
  };
  document.getElementById('saveProject').onclick = () => {
    project.name = document.getElementById('pName').value.trim() || 'Без названия';
    project.type = document.getElementById('pType').value;
    project.address = document.getElementById('pAddress').value.trim();
    project.client = document.getElementById('pClient').value.trim();
    project.contact = document.getElementById('pContact').value.trim();
    saveData();
    alert('Объект сохранён.');
    renderProject();
  };
  document.getElementById('newSurveyBtn').onclick = () => {
    const survey = makeSurvey();
    project.surveys.unshift(survey);
    saveData();
    setView({ view: 'survey', projectId: project.id, surveyId: survey.id, step: 0 });
  };

  document.getElementById('surveyList').innerHTML = project.surveys.length
    ? project.surveys
        .map(
          (s) => `<div class="list-item">
        <div class="row"><div><strong>${s.date}</strong><div class="small">Исполнитель: ${s.performer}</div></div><span class="badge">${s.status}</span></div>
        <div class="row" style="margin-top:8px"><button class="ghost" data-open-survey="${s.id}">Открыть</button><button class="secondary" data-share-survey="${s.id}">Поделиться ссылкой</button></div>
      </div>`,
        )
        .join('')
    : '<p class="small">Пока нет обследований.</p>';

  document.querySelectorAll('[data-open-survey]').forEach((el) => {
    el.onclick = () => setView({ view: 'survey', projectId: project.id, surveyId: el.dataset.openSurvey, step: 0 });
  });
  document.querySelectorAll('[data-share-survey]').forEach((el) => {
    el.onclick = async () => {
      await navigator.clipboard.writeText(
        `${location.origin}${location.pathname}?projectId=${project.id}&surveyId=${el.dataset.shareSurvey}`,
      );
      alert('Ссылка на обследование скопирована.');
    };
  });
}

function makeSurvey() {
  return {
    id: uid(),
    date: formatDate(),
    performer: state.userName,
    projectDocs: 'нет',
    accuracy: '',
    assumptions: [],
    assumptionsText: '',
    risks: [],
    risksText: '',
    status: 'Черновик',
    facades: [],
    exclusions: [],
    foundationTypes: [],
    foundationComment: '',
    workMode: 'день',
    techAccess: 'да',
    workMethod: 'люлька',
    storage: 'есть',
    restrictions: '',
    media: [],
    reserveEnabled: false,
    reservePercent: 3,
    disclaimer: DEFAULT_DISCLAIMER,
    pdfs: [],
    updatedAt: new Date().toISOString(),
  };
}

function renderSurvey() {
  const project = getProject(state.current.projectId);
  if (!project) return setView({ view: 'dashboard' });
  const survey = getSurvey(project, state.current.surveyId);
  if (!survey) return setView({ view: 'project', projectId: project.id });

  const steps = [
    '1. Общие данные',
    '2. Фасады',
    '3. Исключения',
    '4. Основание',
    '5. Монтаж',
    '6. Медиа',
    '7. Риски/проверка',
  ];
  const step = state.current.step || 0;
  const totals = calcSurveyTotals(survey);
  const missing = validateReady(survey);

  setInner(`
  ${renderTopBar()}
  <div class="card">
    <div class="row"><button class="ghost" id="backProject">← К объекту</button><button class="secondary" id="shareSurvey">Поделиться ссылкой</button></div>
    <h2 style="margin-top:10px">Обследование: ${survey.date}</h2>
    <p>Статус: <span class="badge">${survey.status}</span></p>
    <div class="stepper">${steps
      .map((s, i) => `<div class="step ${i === step ? 'active' : ''}" data-step="${i}">${s}</div>`)
      .join('')}</div>
    <div id="stepContent"></div>
    <div class="row" style="margin-top:12px">
      <button class="secondary" id="prevStep" ${step === 0 ? 'disabled' : ''}>Назад</button>
      <button id="nextStep" ${step === steps.length - 1 ? 'disabled' : ''}>Далее</button>
    </div>
  </div>
  <div class="card">
    <h3>Площади</h3>
    <p>Грубая: <strong>${totals.gross.toFixed(2)} м²</strong></p>
    <p>С исключениями: <strong>${totals.net.toFixed(2)} м²</strong> (исключения: ${totals.exclusion.toFixed(2)} м²)</p>
    <div class="row"><label><input type="checkbox" id="reserveEnabled" ${survey.reserveEnabled ? 'checked' : ''}/> Включить запас</label><select id="reservePercent"><option value="3" ${survey.reservePercent === 3 ? 'selected' : ''}>+3%</option><option value="5" ${survey.reservePercent === 5 ? 'selected' : ''}>+5%</option><option value="7" ${survey.reservePercent === 7 ? 'selected' : ''}>+7%</option></select></div>
    <p>С запасом: <strong>${totals.reserve.toFixed(2)} м²</strong></p>
  </div>
  <div class="card ${missing.length ? 'warning' : ''}">
    <h3>Итог</h3>
    ${missing.length ? `<p>Нужно заполнить перед «Готово к расчёту»:</p><ul>${missing.map((m) => `<li>${m}</li>`).join('')}</ul>` : '<p>Проверка пройдена — можно отмечать «Готово к расчёту».</p>'}
    <div class="row"><button class="secondary" id="saveDraft">Сохранить черновик</button><button id="markReady" ${missing.length ? 'disabled' : ''}>Отметить: Готово к расчёту</button></div>
    <div class="row" style="margin-top:8px"><button class="ghost" id="markClarify">На уточнении</button><button class="danger" id="makePdf">Сформировать Акт обследования (PDF)</button></div>
  </div>
  `);

  bindTopBar();

  document.querySelectorAll('[data-step]').forEach((el) => {
    el.onclick = () => {
      autosaveSurvey(survey);
      setView({ ...state.current, step: Number(el.dataset.step) });
    };
  });
  document.getElementById('backProject').onclick = () => setView({ view: 'project', projectId: project.id });
  document.getElementById('shareSurvey').onclick = async () => {
    await navigator.clipboard.writeText(
      `${location.origin}${location.pathname}?projectId=${project.id}&surveyId=${survey.id}`,
    );
    alert('Ссылка скопирована.');
  };
  document.getElementById('prevStep').onclick = () => setView({ ...state.current, step: Math.max(step - 1, 0) });
  document.getElementById('nextStep').onclick = () => setView({ ...state.current, step: Math.min(step + 1, steps.length - 1) });

  document.getElementById('reserveEnabled').onchange = (e) => {
    survey.reserveEnabled = e.target.checked;
    autosaveSurvey(survey, true);
    renderSurvey();
  };
  document.getElementById('reservePercent').onchange = (e) => {
    survey.reservePercent = Number(e.target.value);
    autosaveSurvey(survey, true);
    renderSurvey();
  };

  document.getElementById('saveDraft').onclick = () => {
    survey.status = 'Черновик';
    autosaveSurvey(survey, true);
    alert('Черновик сохранён.');
    renderSurvey();
  };
  document.getElementById('markReady').onclick = () => {
    survey.status = 'Готово к расчёту';
    autosaveSurvey(survey, true);
    alert('Статус обновлён.');
    renderSurvey();
  };
  document.getElementById('markClarify').onclick = () => {
    survey.status = 'На уточнении';
    autosaveSurvey(survey, true);
    renderSurvey();
  };

  document.getElementById('makePdf').onclick = () => buildPdf(project, survey);

  renderStepContent(step, survey);

  state.autosaveId = setInterval(() => autosaveSurvey(survey), 10000);
}

function renderStepContent(step, survey) {
  const wrap = document.getElementById('stepContent');
  if (step === 0) {
    wrap.innerHTML = `
      <div class="grid two">
        <div><label>Дата выезда</label><input type="date" id="sDate" value="${survey.date}"/></div>
        <div><label>Исполнитель</label><input id="sPerformer" value="${survey.performer}"/></div>
        <div><label>Проектная документация</label><select id="sDocs">${['нет', 'частично', 'есть']
          .map((x) => `<option ${survey.projectDocs === x ? 'selected' : ''}>${x}</option>`)
          .join('')}</select></div>
        <div><label>Точность замеров</label><select id="sAcc"><option value="">Выберите</option>${['±5', '±10', '±15']
          .map((x) => `<option ${survey.accuracy === x ? 'selected' : ''}>${x}</option>`)
          .join('')}</select></div>
      </div>`;
    ['sDate', 'sPerformer', 'sDocs', 'sAcc'].forEach((id) => {
      document.getElementById(id).onchange = () => {
        survey.date = document.getElementById('sDate').value;
        survey.performer = document.getElementById('sPerformer').value;
        survey.projectDocs = document.getElementById('sDocs').value;
        survey.accuracy = document.getElementById('sAcc').value;
        autosaveSurvey(survey);
      };
    });
  }

  if (step === 1) {
    wrap.innerHTML = `
      <div class="row"><button id="addFacade">Добавить фасад</button></div>
      <table class="table"><thead><tr><th>Код</th><th>Длина</th><th>Высота</th><th>Площадь</th><th>Примечание</th><th></th></tr></thead><tbody id="facadesBody"></tbody></table>
    `;
    drawFacades(survey);
    document.getElementById('addFacade').onclick = () => {
      survey.facades.push({ id: uid(), code: facadeCodeOptions[0], length: '', height: '', note: '' });
      autosaveSurvey(survey, true);
      drawFacades(survey);
    };
  }

  if (step === 2) {
    wrap.innerHTML = `
      <div class="row"><button id="addExclusion">Добавить исключение/проём</button></div>
      <table class="table"><thead><tr><th>Тип</th><th>Фасад</th><th>Ширина</th><th>Высота</th><th>Кол-во</th><th>Площадь</th><th>Комментарий</th><th></th></tr></thead><tbody id="exclusionsBody"></tbody></table>
    `;
    drawExclusions(survey);
    document.getElementById('addExclusion').onclick = () => {
      survey.exclusions.push({ id: uid(), type: 'окно', facadeCode: survey.facades[0]?.code || '', width: '', height: '', qty: 1, comment: '' });
      autosaveSurvey(survey, true);
      drawExclusions(survey);
    };
  }

  if (step === 3) {
    const types = ['бетон', 'кирпич', 'сэндвич', 'металлокаркас', 'комбо'];
    wrap.innerHTML = `<div class="grid two">${types
      .map(
        (t) => `<label><input type="checkbox" data-foundation="${t}" ${survey.foundationTypes.includes(t) ? 'checked' : ''}/> ${t}</label>`,
      )
      .join('')}</div><label>Комментарий</label><textarea id="foundationComment">${survey.foundationComment}</textarea>`;

    document.querySelectorAll('[data-foundation]').forEach((el) => {
      el.onchange = () => {
        const t = el.dataset.foundation;
        survey.foundationTypes = el.checked
          ? [...new Set([...survey.foundationTypes, t])]
          : survey.foundationTypes.filter((x) => x !== t);
        autosaveSurvey(survey);
      };
    });
    document.getElementById('foundationComment').oninput = (e) => {
      survey.foundationComment = e.target.value;
      autosaveSurvey(survey);
    };
  }

  if (step === 4) {
    wrap.innerHTML = `<div class="grid two">
      <div><label>Режим работ</label><select id="workMode">${['день', 'ночь', 'по графику ТЦ']
        .map((x) => `<option ${survey.workMode === x ? 'selected' : ''}>${x}</option>`)
        .join('')}</select></div>
      <div><label>Доступ техники</label><select id="techAccess">${['да', 'нет', 'ограничен']
        .map((x) => `<option ${survey.techAccess === x ? 'selected' : ''}>${x}</option>`)
        .join('')}</select></div>
      <div><label>Способ работ</label><select id="workMethod">${['люлька', 'подъёмник', 'леса', 'кран']
        .map((x) => `<option ${survey.workMethod === x ? 'selected' : ''}>${x}</option>`)
        .join('')}</select></div>
      <div><label>Место складирования</label><select id="storage">${['есть', 'нет', 'ограничено']
        .map((x) => `<option ${survey.storage === x ? 'selected' : ''}>${x}</option>`)
        .join('')}</select></div></div>
      <label>Прочие ограничения</label><textarea id="restrictions">${survey.restrictions}</textarea>`;

    ['workMode', 'techAccess', 'workMethod', 'storage'].forEach((id) => {
      document.getElementById(id).onchange = (e) => {
        survey[id] = e.target.value;
        autosaveSurvey(survey);
      };
    });
    document.getElementById('restrictions').oninput = (e) => {
      survey.restrictions = e.target.value;
      autosaveSurvey(survey);
    };
  }

  if (step === 5) {
    wrap.innerHTML = `
      <label>Загрузка фото/видео/файлов (можно выбрать несколько)</label>
      <input id="mediaInput" type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx" />
      <div id="mediaList" class="media-grid" style="margin-top:10px"></div>
    `;
    document.getElementById('mediaInput').onchange = async (e) => {
      const files = [...e.target.files];
      for (const f of files) {
        const dataUrl = await toDataUrl(f);
        survey.media.push({ id: uid(), name: f.name, mime: f.type, dataUrl, category: 'other', facadeCode: '' });
      }
      autosaveSurvey(survey, true);
      drawMedia(survey);
    };
    drawMedia(survey);
  }

  if (step === 6) {
    const assumptionsBase = ['Замеры рулеткой без лесов', 'Часть узлов не вскрывалась', 'Размеры по доступной зоне'];
    const risksBase = ['Ограниченный доступ техники', 'Работы без остановки эксплуатации', 'Скрытые дефекты основания'];

    wrap.innerHTML = `
      <h3>Допущения</h3>
      ${assumptionsBase
        .map(
          (a) => `<label><input type="checkbox" data-assumption="${a}" ${survey.assumptions.includes(a) ? 'checked' : ''}/> ${a}</label>`,
        )
        .join('')}
      <label>Свои допущения</label><textarea id="assumptionsText">${survey.assumptionsText}</textarea>
      <h3 style="margin-top:10px">Риски</h3>
      ${risksBase
        .map((r) => `<label><input type="checkbox" data-risk="${r}" ${survey.risks.includes(r) ? 'checked' : ''}/> ${r}</label>`)
        .join('')}
      <label>Свои риски</label><textarea id="risksText">${survey.risksText}</textarea>
      <label>Дисклеймер для PDF</label><textarea id="disclaimer">${survey.disclaimer}</textarea>
    `;

    document.querySelectorAll('[data-assumption]').forEach((el) => {
      el.onchange = () => {
        const v = el.dataset.assumption;
        survey.assumptions = el.checked ? [...new Set([...survey.assumptions, v])] : survey.assumptions.filter((x) => x !== v);
        autosaveSurvey(survey);
      };
    });
    document.querySelectorAll('[data-risk]').forEach((el) => {
      el.onchange = () => {
        const v = el.dataset.risk;
        survey.risks = el.checked ? [...new Set([...survey.risks, v])] : survey.risks.filter((x) => x !== v);
        autosaveSurvey(survey);
      };
    });
    ['assumptionsText', 'risksText', 'disclaimer'].forEach((id) => {
      document.getElementById(id).oninput = (e) => {
        survey[id] = e.target.value;
        autosaveSurvey(survey);
      };
    });
  }
}

function drawFacades(survey) {
  const body = document.getElementById('facadesBody');
  body.innerHTML = survey.facades
    .map((f) => {
      const area = Number(f.length || 0) * Number(f.height || 0);
      return `<tr>
      <td><select data-facade-code="${f.id}">${facadeCodeOptions
        .map((c) => `<option ${f.code === c ? 'selected' : ''}>${c}</option>`)
        .join('')}</select></td>
      <td><input data-facade-length="${f.id}" type="number" step="0.01" value="${f.length}"/></td>
      <td><input data-facade-height="${f.id}" type="number" step="0.01" value="${f.height}"/></td>
      <td>${area.toFixed(2)}</td>
      <td><input data-facade-note="${f.id}" value="${f.note || ''}"/></td>
      <td><button class="danger" data-del-facade="${f.id}">Удалить</button></td></tr>`;
    })
    .join('');

  ['code', 'length', 'height', 'note'].forEach((k) => {
    document.querySelectorAll(`[data-facade-${k}]`).forEach((el) => {
      el.onchange = () => {
        const id = el.dataset[`facade${k[0].toUpperCase() + k.slice(1)}`];
        const f = survey.facades.find((x) => x.id === id);
        f[k] = ['length', 'height'].includes(k) ? Number(el.value) : el.value;
        autosaveSurvey(survey, true);
        drawFacades(survey);
      };
    });
  });

  document.querySelectorAll('[data-del-facade]').forEach((el) => {
    el.onclick = () => {
      survey.facades = survey.facades.filter((x) => x.id !== el.dataset.delFacade);
      autosaveSurvey(survey, true);
      drawFacades(survey);
    };
  });
}

function drawExclusions(survey) {
  const body = document.getElementById('exclusionsBody');
  body.innerHTML = survey.exclusions
    .map((e) => {
      const area = Number(e.width || 0) * Number(e.height || 0) * Number(e.qty || 0);
      return `<tr>
      <td><select data-ex-type="${e.id}">${['окно', 'витраж', 'вход', 'реклама', 'другое']
        .map((t) => `<option ${e.type === t ? 'selected' : ''}>${t}</option>`)
        .join('')}</select></td>
      <td><select data-ex-facade="${e.id}"><option value="">—</option>${survey.facades
        .map((f) => `<option ${e.facadeCode === f.code ? 'selected' : ''}>${f.code}</option>`)
        .join('')}</select></td>
      <td><input data-ex-width="${e.id}" type="number" value="${e.width}"/></td>
      <td><input data-ex-height="${e.id}" type="number" value="${e.height}"/></td>
      <td><input data-ex-qty="${e.id}" type="number" value="${e.qty}"/></td>
      <td>${area.toFixed(2)}</td>
      <td><input data-ex-comment="${e.id}" value="${e.comment || ''}"/></td>
      <td><button class="danger" data-del-ex="${e.id}">Удалить</button></td>
      </tr>`;
    })
    .join('');

  ['type', 'facade', 'width', 'height', 'qty', 'comment'].forEach((k) => {
    document.querySelectorAll(`[data-ex-${k}]`).forEach((el) => {
      el.onchange = () => {
        const id = el.dataset[`ex${k[0].toUpperCase() + k.slice(1)}`];
        const ex = survey.exclusions.find((x) => x.id === id);
        if (!ex) return;
        const map = { facade: 'facadeCode' };
        const target = map[k] || k;
        ex[target] = ['width', 'height', 'qty'].includes(k) ? Number(el.value) : el.value;
        autosaveSurvey(survey, true);
        drawExclusions(survey);
      };
    });
  });

  document.querySelectorAll('[data-del-ex]').forEach((el) => {
    el.onclick = () => {
      survey.exclusions = survey.exclusions.filter((x) => x.id !== el.dataset.delEx);
      autosaveSurvey(survey, true);
      drawExclusions(survey);
    };
  });
}

function drawMedia(survey) {
  const list = document.getElementById('mediaList');
  list.innerHTML = survey.media
    .map((m) => {
      const preview = m.mime.startsWith('image')
        ? `<img src="${m.dataUrl}" alt="${m.name}" />`
        : m.mime.startsWith('video')
          ? `<video src="${m.dataUrl}" controls></video>`
          : '<div class="small">Файл</div>';
      return `<div class="media-card">${preview}<div class="small">${m.name}</div>
      <select data-media-cat="${m.id}">${categories
        .map((c) => `<option value="${c.key}" ${m.category === c.key ? 'selected' : ''}>${c.label}</option>`)
        .join('')}</select>
      <select data-media-facade="${m.id}"><option value="">Без привязки</option>${survey.facades
        .map((f) => `<option ${m.facadeCode === f.code ? 'selected' : ''}>${f.code}</option>`)
        .join('')}</select>
      <button class="danger" data-del-media="${m.id}">Удалить</button>
      </div>`;
    })
    .join('');

  document.querySelectorAll('[data-media-cat]').forEach((el) => {
    el.onchange = () => {
      const m = survey.media.find((x) => x.id === el.dataset.mediaCat);
      m.category = el.value;
      autosaveSurvey(survey);
    };
  });
  document.querySelectorAll('[data-media-facade]').forEach((el) => {
    el.onchange = () => {
      const m = survey.media.find((x) => x.id === el.dataset.mediaFacade);
      m.facadeCode = el.value;
      autosaveSurvey(survey);
    };
  });
  document.querySelectorAll('[data-del-media]').forEach((el) => {
    el.onclick = () => {
      survey.media = survey.media.filter((x) => x.id !== el.dataset.delMedia);
      autosaveSurvey(survey, true);
      drawMedia(survey);
    };
  });
}

function autosaveSurvey(survey, rerender = false) {
  survey.updatedAt = new Date().toISOString();
  saveData();
  if (rerender && state.current.view === 'survey') renderSurvey();
}

async function toDataUrl(file) {
  return await new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });
}

async function buildPdf(project, survey) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'pt', 'a4');
  const totals = calcSurveyTotals(survey);

  let y = 36;
  doc.setFontSize(14);
  doc.text('Акт обследования (для предварительного расчёта)', 40, y);
  y += 20;
  doc.setFontSize(10);
  doc.text(`Компания: Remeslo`, 40, y);
  y += 14;
  doc.text(`Объект: ${project.name}`, 40, y);
  y += 14;
  doc.text(`Адрес: ${project.address || '—'}`, 40, y);
  y += 14;
  doc.text(`Дата: ${survey.date}   Исполнитель: ${survey.performer}`, 40, y);
  y += 20;
  doc.text(`Проектная документация: ${survey.projectDocs}  | Метод: обследование + замеры | Точность: ${survey.accuracy || 'не указана'}`, 40, y, { maxWidth: 520 });

  doc.autoTable({
    startY: y + 14,
    head: [['Фасад', 'Длина', 'Высота', 'Площадь', 'Примечание']],
    body: survey.facades.map((f) => [f.code, f.length || 0, f.height || 0, (Number(f.length || 0) * Number(f.height || 0)).toFixed(2), f.note || '']),
    styles: { fontSize: 9 },
  });

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 16,
    head: [['Тип', 'Фасад', 'Ширина', 'Высота', 'Кол-во', 'Площадь', 'Комментарий']],
    body: survey.exclusions.map((e) => [e.type, e.facadeCode, e.width || 0, e.height || 0, e.qty || 0, (Number(e.width || 0) * Number(e.height || 0) * Number(e.qty || 0)).toFixed(2), e.comment || '']),
    styles: { fontSize: 9 },
  });

  y = doc.lastAutoTable.finalY + 18;
  doc.text(`Итоги: грубая ${totals.gross.toFixed(2)} м², с исключениями ${totals.net.toFixed(2)} м², с запасом ${totals.reserve.toFixed(2)} м²`, 40, y, { maxWidth: 520 });
  y += 16;
  doc.text(`Основание/подсистема: ${survey.foundationTypes.join(', ') || '—'}. ${survey.foundationComment || ''}`, 40, y, { maxWidth: 520 });
  y += 22;
  doc.text(`Условия монтажа: режим ${survey.workMode}, техника ${survey.techAccess}, способ ${survey.workMethod}, складирование ${survey.storage}. ${survey.restrictions || ''}`, 40, y, { maxWidth: 520 });
  y += 24;
  doc.text(`Допущения: ${survey.assumptions.join('; ')} ${survey.assumptionsText}`, 40, y, { maxWidth: 520 });
  y += 20;
  doc.text(`Риски: ${survey.risks.join('; ')} ${survey.risksText}`, 40, y, { maxWidth: 520 });

  const photos = survey.media.filter((m) => m.mime.startsWith('image'));
  if (photos.length) {
    doc.addPage();
    doc.text('Фото-приложение', 40, 36);
    let px = 40;
    let py = 60;
    let c = 0;
    for (const m of photos) {
      try {
        doc.addImage(m.dataUrl, 'JPEG', px, py, 120, 90);
      } catch {}
      doc.text(`${categories.find((x) => x.key === m.category)?.label || 'Прочее'} ${m.facadeCode ? `(${m.facadeCode})` : ''}`, px, py + 104, { maxWidth: 120 });
      px += 140;
      c += 1;
      if (c % 3 === 0) {
        px = 40;
        py += 130;
      }
      if (py > 700) {
        doc.addPage();
        px = 40;
        py = 60;
      }
    }
  }

  doc.addPage();
  doc.text('Дисклеймер', 40, 40);
  doc.text(survey.disclaimer || DEFAULT_DISCLAIMER, 40, 60, { maxWidth: 520 });

  const blob = doc.output('blob');
  const dataUrl = await blobToDataUrl(blob);
  const filename = `akt-${project.name}-${survey.date}.pdf`.replace(/\s+/g, '_');
  survey.pdfs.push({ id: uid(), createdAt: new Date().toISOString(), filename, dataUrl });
  autosaveSurvey(survey, true);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function render() {
  if (!state.userName) return renderStart();
  if (state.current.view === 'start') return renderStart();
  if (state.current.view === 'project') return renderProject();
  if (state.current.view === 'survey') return renderSurvey();
  return renderDashboard();
}

routeFromQuery();
if (!state.current.view || state.current.view === 'start') {
  state.current = state.userName ? { view: 'dashboard' } : { view: 'start' };
}
render();
