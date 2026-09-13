const form = document.querySelector('#compare-form');
const questionInput = document.querySelector('#question');
const runButton = document.querySelector('#run-button');
const statusLine = document.querySelector('#run-status');
const baselineAnswer = document.querySelector('#baseline-answer');
const agentAnswer = document.querySelector('#agent-answer');
const traceList = document.querySelector('#trace-list');
const traceCount = document.querySelector('#trace-count');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderTrace(trace) {
  traceList.replaceChildren();
  const toolEvents = trace.filter((event) => event.action_type === 'TOOL_EXECUTION');
  traceCount.textContent = `${toolEvents.length} lượt gọi tool`;

  if (trace.length === 0) {
    traceList.append(element('div', 'trace-empty', 'Agent chưa tạo sự kiện trace.'));
    return;
  }

  for (const event of trace) {
    const isTool = event.action_type === 'TOOL_EXECUTION';
    const item = element('div', `trace-item ${isTool ? 'trace-tool' : 'trace-final'}`);
    const marker = element('div', 'trace-marker', String(event.step ?? '·'));
    const body = element('div', 'trace-body');
    const heading = element('div', 'trace-item-heading');
    heading.append(element('strong', '', isTool ? 'Quyết định & gọi công cụ' : 'Kết luận'));
    if (typeof event.latency_ms === 'number') {
      heading.append(element('span', 'latency', `${event.latency_ms} ms`));
    }
    body.append(heading);

    if (event.thought) {
      const thought = element('p', 'thought-text', event.thought);
      body.append(thought);
    }

    if (isTool) {
      const action = element('div', 'trace-detail');
      action.append(element('span', 'detail-label', 'ACTION'));
      action.append(element('code', 'detail-value', `${event.tool_name}(${JSON.stringify(event.arguments ?? {})})`));
      body.append(action);

      const observation = element('div', 'trace-detail');
      observation.append(element('span', 'detail-label', 'OBSERVATION'));
      observation.append(element('pre', 'detail-value observation-value', JSON.stringify(event.observation ?? {}, null, 2)));
      body.append(observation);
    } else if (event.output) {
      body.append(element('p', 'final-preview', event.output));
    }
    item.append(marker, body);
    traceList.append(item);
  }
}

async function loadMeta() {
  try {
    const response = await fetch('/api/meta');
    if (!response.ok) throw new Error('Không lấy được cấu hình');
    const meta = await response.json();
    document.querySelector('#runtime-label').textContent = `${meta.provider} · ${meta.mcp_server}`;
    document.querySelector('#model-pill').textContent = meta.model || meta.provider;
  } catch {
    document.querySelector('#runtime-label').textContent = 'Máy chủ chưa sẵn sàng';
    document.querySelector('#model-pill').textContent = 'Chưa kết nối';
  }
}

for (const button of document.querySelectorAll('[data-question]')) {
  button.addEventListener('click', () => {
    questionInput.value = button.dataset.question;
    questionInput.focus();
  });
}

questionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;

  runButton.disabled = true;
  runButton.textContent = 'Đang chạy…';
  statusLine.textContent = 'Đang gọi LLM và MCP Server. Vui lòng đợi…';
  statusLine.classList.remove('error');

  try {
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không thể chạy so sánh.');

    baselineAnswer.textContent = data.baseline_answer || 'Chatbot không trả về nội dung.';
    agentAnswer.textContent = data.agent_answer || 'Agent không trả về nội dung.';
    baselineAnswer.classList.remove('empty-answer');
    agentAnswer.classList.remove('empty-answer');
    renderTrace(data.trace ?? []);
    statusLine.textContent = `Đã hoàn tất · ${data.model || data.provider} · ${(data.trace ?? []).length} sự kiện trace`;
  } catch (error) {
    statusLine.textContent = error.message;
    statusLine.classList.add('error');
  } finally {
    runButton.disabled = false;
    runButton.innerHTML = '<span aria-hidden="true">▶</span> Chạy so sánh';
  }
});

loadMeta();
