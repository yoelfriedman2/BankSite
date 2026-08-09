import { launch } from "./cdp.mjs";

const BASE = "http://localhost:3939";
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}`); }
}

const b = await launch({ width: 1280, height: 900 });
try {
  await b.goto(`${BASE}/banks`);

  // Open the first bank's drawer.
  await b.clickSelector("tbody tr, [data-bank-row]");
  await new Promise((r) => setTimeout(r, 500));

  const dialogOpen = await b.eval(`return !!document.querySelector('[role="dialog"]');`);
  check("bank drawer opened", dialogOpen);

  // --- Shared notes composer ---
  const heightBefore = await b.eval(`
    const ta = document.querySelector('textarea[placeholder="Add a note for everyone…"]');
    return ta ? ta.getBoundingClientRect().height : null;
  `);
  check("shared-notes textarea found", heightBefore !== null);

  await b.setInput(
    'textarea[placeholder="Add a note for everyone…"]',
    Array.from({ length: 12 }, (_, i) => `This is line ${i + 1} of a much longer shared note that should force the box to grow instead of scrolling internally.`).join("\n")
  );
  await new Promise((r) => setTimeout(r, 200));

  const heightAfter = await b.eval(`
    const ta = document.querySelector('textarea[placeholder="Add a note for everyone…"]');
    return ta.getBoundingClientRect().height;
  `);
  const scrollHeightVsClientHeight = await b.eval(`
    const ta = document.querySelector('textarea[placeholder="Add a note for everyone…"]');
    return { scrollHeight: ta.scrollHeight, clientHeight: ta.clientHeight, overflowY: getComputedStyle(ta).overflowY };
  `);
  check(`shared-notes grew (before=${heightBefore}px after=${heightAfter}px)`, heightAfter > heightBefore + 50);
  check(
    `shared-notes has no internal scroll (scrollHeight=${scrollHeightVsClientHeight.scrollHeight} clientHeight=${scrollHeightVsClientHeight.clientHeight})`,
    scrollHeightVsClientHeight.scrollHeight <= scrollHeightVsClientHeight.clientHeight + 2
  );

  // Clear it back down and confirm it shrinks again.
  await b.setInput('textarea[placeholder="Add a note for everyone…"]', "short");
  await new Promise((r) => setTimeout(r, 200));
  const heightShrunk = await b.eval(`
    const ta = document.querySelector('textarea[placeholder="Add a note for everyone…"]');
    return ta.getBoundingClientRect().height;
  `);
  check(`shared-notes shrinks back down (short=${heightShrunk}px vs grown=${heightAfter}px)`, heightShrunk < heightAfter);

  // --- My notes (private) ---
  // Expand "My notes" (click its pencil / "Private note" trigger).
  await b.clickText("button", "Private note").catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  const myNotesFound = await b.eval(`
    const boxes = [...document.querySelectorAll('h4,div')].filter(e => (e.textContent||'').trim() === 'My notes');
    return boxes.length > 0 && !!document.querySelectorAll('textarea').length;
  `);
  check("My notes section reachable", myNotesFound);

  // Find the "My notes" textarea specifically (it's the one inside the "My notes" Box, not the shared-notes one).
  const myNotesSelectorInfo = await b.eval(`
    const boxes = [...document.querySelectorAll('div')];
    const notesBox = boxes.find(d => {
      const h = d.querySelector(':scope > div h4, :scope h4');
      return h && h.textContent.trim() === 'My notes';
    });
    const ta = notesBox ? notesBox.querySelector('textarea') : null;
    return ta ? true : false;
  `);
  if (myNotesSelectorInfo) {
    const before = await b.eval(`
      const boxes = [...document.querySelectorAll('div')];
      const notesBox = boxes.find(d => {
        const h = d.querySelector(':scope > div h4, :scope h4');
        return h && h.textContent.trim() === 'My notes';
      });
      const ta = notesBox.querySelector('textarea');
      return ta.getBoundingClientRect().height;
    `);
    await b.eval(`
      const boxes = [...document.querySelectorAll('div')];
      const notesBox = boxes.find(d => {
        const h = d.querySelector(':scope > div h4, :scope h4');
        return h && h.textContent.trim() === 'My notes';
      });
      const ta = notesBox.querySelector('textarea');
      const proto = HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(ta, Array.from({length: 10}, (_, i) => 'Private note line ' + i + ' that is reasonably long to force growth.').join('\\n'));
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    `);
    await new Promise((r) => setTimeout(r, 200));
    const after = await b.eval(`
      const boxes = [...document.querySelectorAll('div')];
      const notesBox = boxes.find(d => {
        const h = d.querySelector(':scope > div h4, :scope h4');
        return h && h.textContent.trim() === 'My notes';
      });
      const ta = notesBox.querySelector('textarea');
      return ta.getBoundingClientRect().height;
    `);
    check(`My notes textarea grew (before=${before}px after=${after}px)`, after > before + 30);
  } else {
    console.log("  (skipped My notes growth check — selector not found)");
  }

  check("no console errors", b.consoleErrors.length === 0);
  if (b.consoleErrors.length) console.log(b.consoleErrors);

  // --- Mobile check ---
  await b.setViewport(375, 800);
  await new Promise((r) => setTimeout(r, 300));
  const mobileOverflow = await b.overflows();
  check("no 375px overflow with drawer open", !mobileOverflow);

  await b.setInput(
    'textarea[placeholder="Add a note for everyone…"]',
    Array.from({ length: 8 }, (_, i) => `Mobile long note line ${i + 1} to force growth on a narrow screen.`).join("\n")
  );
  await new Promise((r) => setTimeout(r, 200));
  const mobileHeight = await b.eval(`
    const ta = document.querySelector('textarea[placeholder="Add a note for everyone…"]');
    return ta.getBoundingClientRect().height;
  `);
  check(`mobile shared-notes also grows (height=${mobileHeight}px)`, mobileHeight > 100);
  const mobileOverflowAfterGrow = await b.overflows();
  check("still no 375px overflow after growing", !mobileOverflowAfterGrow);

} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail > 0 ? 1 : 0);
}
