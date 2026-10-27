import clsx from 'clsx';
import type { Q } from './questions';

function Cell({ children, hot, dim }: { children: React.ReactNode; hot?: boolean; dim?: boolean }) {
  return <div className={clsx('rounded-lg h-10 grid place-items-center font-body font-extrabold text-xl', hot ? 'text-teal bg-teal/10 border border-teal/40' : 'dt-workcol text-ink', dim && 'text-muted')}>{children}</div>;
}
const Q = <span className="text-muted">?</span>;

export default function WorkBoard({ q, lvl }: { q: Q; lvl: number }) {
  const k = q.work;
  if (k.type === 'cols') {
    const os = k.ao + k.bo;
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[28px_1fr_1fr] gap-2 text-center text-[10px] font-body tracking-widest"><div /><div className="text-amber">TENS</div><div className="text-teal">ONES</div></div>
        <div className="grid grid-cols-[28px_1fr_1fr] gap-2 items-center"><div className="text-[9px] text-muted text-right">carry</div><Cell>{lvl >= 2 && k.c ? <span className="text-amber">1</span> : <span className="text-line">—</span>}</Cell><Cell><span className="text-line">—</span></Cell></div>
        <div className="grid grid-cols-[28px_1fr_1fr] gap-2 items-center"><div /><Cell>{k.at}</Cell><Cell>{k.ao}</Cell></div>
        <div className="grid grid-cols-[28px_1fr_1fr] gap-2 items-center"><div className="text-muted text-right font-bold">+</div><Cell>{k.bt}</Cell><Cell>{k.bo}</Cell></div>
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(14,140,140,.5), transparent)' }} />
        <div className="grid grid-cols-[28px_1fr_1fr] gap-2 items-center"><div className="text-teal text-right font-bold">=</div><Cell hot>{lvl >= 3 ? Math.floor(k.s / 10) : Q}</Cell><Cell hot>{lvl >= 2 ? os % 10 : Q}</Cell></div>
        <Note>{lvl >= 1 && <p className={clsx(lvl === 1 && 'text-amber font-bold')}>1. Ones: {k.ao} + {k.bo} = {lvl >= 2 ? os : '?'}</p>}{lvl >= 2 && <p className={clsx(lvl === 2 && 'text-amber font-bold')}>2. {k.c ? `Write ${os % 10}, carry 1. Tens: ${k.at} + ${k.bt} + 1 = ${lvl >= 3 ? k.at + k.bt + 1 : '?'}` : `Tens: ${k.at} + ${k.bt} = ${lvl >= 3 ? k.at + k.bt : '?'}`}</p>}{lvl >= 3 && <p className="text-amber font-bold">3. {k.a} + {k.b} = {k.s}</p>}{lvl === 0 && <p>Add the ones first, then the tens.</p>}</Note>
      </div>
    );
  }
  if (k.type === 'tenframe') {
    return (
      <div>
        <div className="grid grid-cols-5 gap-1.5 max-w-[220px] mx-auto">{Array.from({ length: 20 }).map((_, i) => <i key={i} className={clsx('block aspect-square rounded-full border border-line', i < k.big ? 'bg-teal' : i < k.big + k.sm ? 'bg-tutor' : 'bg-line/40')} />)}</div>
        <Note><p>{k.big} blue fill the top row with {k.need} pink.</p>{lvl >= 2 && <p className="text-amber font-bold">10 + {k.sm - k.need} = {lvl >= 3 ? k.s : '?'}</p>}</Note>
      </div>
    );
  }
  if (k.type === 'seq') {
    return (
      <div>
        <div className="flex items-center justify-center gap-2 font-body font-extrabold text-xl">{k.seq.map((n: number, i: number) => <span key={i} className="contents"><Cell>{n}</Cell><small className="text-teal text-xs">+{k.step}</small></span>)}<Cell hot>{lvl >= 3 ? k.s : Q}</Cell></div>
        <Note><p>{lvl >= 1 ? `${k.seq[2]} + ${k.step} = ${lvl >= 3 ? k.s : '?'}` : 'Every jump is the same size.'}</p></Note>
      </div>
    );
  }
  if (k.type === 'countup') {
    const j1 = k.toTen, j2 = k.c - k.mid;
    return (
      <div>
        <div className="flex items-center justify-center gap-2 font-body font-extrabold text-xl"><Cell>{k.a}</Cell>{j1 ? <><small className="text-teal text-xs">+{lvl >= 2 ? j1 : '?'}</small><Cell>{lvl >= 2 ? k.mid : Q}</Cell></> : null}<small className="text-teal text-xs">+{lvl >= 2 ? j2 : '?'}</small><Cell>{k.c}</Cell></div>
        <Note><p>{lvl >= 2 ? (j1 ? `${j1} + ${j2} = ${lvl >= 3 ? k.s : '?'}` : `One jump of ${j2}`) : 'Jump to the next ten, then to the total. Add the jumps.'}</p></Note>
      </div>
    );
  }
  if (k.type === 'array') {
    return (
      <div>
        <div className="grid gap-1.5 mx-auto" style={{ gridTemplateColumns: `repeat(${k.c}, 1fr)`, maxWidth: k.c * 34 }}>{Array.from({ length: k.r * k.c }).map((_, i) => <i key={i} className={clsx('block aspect-square rounded-full border border-line', lvl >= 1 ? 'bg-teal' : 'bg-line/40')} />)}</div>
        <Note><p>{lvl >= 1 ? Array(k.r).fill(k.c).join(' + ') + (lvl >= 3 ? ` = ${k.s}` : ' = ?') : 'Count one row, then add it for every row.'}</p></Note>
      </div>
    );
  }
  return <Note>{k.steps.map((s: string, i: number) => <p key={i} className={clsx(i < lvl ? (i === lvl - 1 ? 'text-amber font-bold' : '') : 'text-muted')}>{i + 1}. {i < lvl ? s : '…'}</p>)}</Note>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 rounded-xl px-3 py-2 text-[12.5px] font-display leading-snug space-y-1" style={{ background: 'rgba(255,199,44,.12)', border: '1px solid rgba(255,199,44,.4)', color: 'rgb(31,45,77)' }}>{children}</div>;
}
