import clsx from 'clsx';
import type { Q } from './questions';

function Cell({ children, hot, dim }: { children: React.ReactNode; hot?: boolean; dim?: boolean }) {
  return <div className={clsx('rounded-lg h-10 grid place-items-center font-body font-extrabold text-xl', hot ? 'text-[#35e0ff] bg-[rgba(53,224,255,.12)] border border-[rgba(53,224,255,.4)]' : 'dt-workcol text-white', dim && 'text-white/30')}>{children}</div>;
}
const Q = <span className="text-white/30">?</span>;

export default function WorkBoard({ q, lvl }: { q: Q; lvl: number }) {
  const k = q.work;
  if (k.type === 'cols') {
    const os = k.ao + k.bo;
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[28px_1fr_1fr] gap-2 text-center text-[10px] font-body tracking-widest"><div /><div className="text-[#ffd98a]/80">TENS</div><div className="text-[#9fe9ff]/80">ONES</div></div>
        <div className="grid grid-cols-[28px_1fr_1fr] gap-2 items-center"><div className="text-[9px] text-white/40 text-right">carry</div><Cell>{lvl >= 2 && k.c ? <span className="text-[#ffd98a]">1</span> : <span className="text-white/20">—</span>}</Cell><Cell><span className="text-white/20">—</span></Cell></div>
        <div className="grid grid-cols-[28px_1fr_1fr] gap-2 items-center"><div /><Cell>{k.at}</Cell><Cell>{k.ao}</Cell></div>
        <div className="grid grid-cols-[28px_1fr_1fr] gap-2 items-center"><div className="text-white/60 text-right font-bold">+</div><Cell>{k.bt}</Cell><Cell>{k.bo}</Cell></div>
        <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(53,224,255,.5), transparent)' }} />
        <div className="grid grid-cols-[28px_1fr_1fr] gap-2 items-center"><div className="text-[#35e0ff] text-right font-bold">=</div><Cell hot>{lvl >= 3 ? Math.floor(k.s / 10) : Q}</Cell><Cell hot>{lvl >= 2 ? os % 10 : Q}</Cell></div>
        <Note>{lvl >= 1 && <p className={clsx(lvl === 1 && 'text-[#ffe6a8]')}>1. Ones: {k.ao} + {k.bo} = {lvl >= 2 ? os : '?'}</p>}{lvl >= 2 && <p className={clsx(lvl === 2 && 'text-[#ffe6a8]')}>2. {k.c ? `Write ${os % 10}, carry 1. Tens: ${k.at} + ${k.bt} + 1 = ${lvl >= 3 ? k.at + k.bt + 1 : '?'}` : `Tens: ${k.at} + ${k.bt} = ${lvl >= 3 ? k.at + k.bt : '?'}`}</p>}{lvl >= 3 && <p className="text-[#ffe6a8]">3. {k.a} + {k.b} = {k.s}</p>}{lvl === 0 && <p>Add the ones first, then the tens.</p>}</Note>
      </div>
    );
  }
  if (k.type === 'tenframe') {
    return (
      <div>
        <div className="grid grid-cols-5 gap-1.5 max-w-[220px] mx-auto">{Array.from({ length: 20 }).map((_, i) => <i key={i} className={clsx('block aspect-square rounded-full border border-white/15', i < k.big ? 'bg-[#35e0ff]' : i < k.big + k.sm ? 'bg-[#ff4f8b]' : 'bg-white/5')} />)}</div>
        <Note><p>{k.big} blue fill the top row with {k.need} pink.</p>{lvl >= 2 && <p className="text-[#ffe6a8]">10 + {k.sm - k.need} = {lvl >= 3 ? k.s : '?'}</p>}</Note>
      </div>
    );
  }
  if (k.type === 'seq') {
    return (
      <div>
        <div className="flex items-center justify-center gap-2 font-body font-extrabold text-xl">{k.seq.map((n: number, i: number) => <span key={i} className="contents"><Cell>{n}</Cell><small className="text-[#35e0ff] text-xs">+{k.step}</small></span>)}<Cell hot>{lvl >= 3 ? k.s : Q}</Cell></div>
        <Note><p>{lvl >= 1 ? `${k.seq[2]} + ${k.step} = ${lvl >= 3 ? k.s : '?'}` : 'Every jump is the same size.'}</p></Note>
      </div>
    );
  }
  if (k.type === 'countup') {
    const j1 = k.toTen, j2 = k.c - k.mid;
    return (
      <div>
        <div className="flex items-center justify-center gap-2 font-body font-extrabold text-xl"><Cell>{k.a}</Cell>{j1 ? <><small className="text-[#35e0ff] text-xs">+{lvl >= 2 ? j1 : '?'}</small><Cell>{lvl >= 2 ? k.mid : Q}</Cell></> : null}<small className="text-[#35e0ff] text-xs">+{lvl >= 2 ? j2 : '?'}</small><Cell>{k.c}</Cell></div>
        <Note><p>{lvl >= 2 ? (j1 ? `${j1} + ${j2} = ${lvl >= 3 ? k.s : '?'}` : `One jump of ${j2}`) : 'Jump to the next ten, then to the total. Add the jumps.'}</p></Note>
      </div>
    );
  }
  if (k.type === 'array') {
    return (
      <div>
        <div className="grid gap-1.5 mx-auto" style={{ gridTemplateColumns: `repeat(${k.c}, 1fr)`, maxWidth: k.c * 34 }}>{Array.from({ length: k.r * k.c }).map((_, i) => <i key={i} className={clsx('block aspect-square rounded-full border border-white/15', lvl >= 1 ? 'bg-[#35e0ff]' : 'bg-white/5')} />)}</div>
        <Note><p>{lvl >= 1 ? Array(k.r).fill(k.c).join(' + ') + (lvl >= 3 ? ` = ${k.s}` : ' = ?') : 'Count one row, then add it for every row.'}</p></Note>
      </div>
    );
  }
  return <Note>{k.steps.map((s: string, i: number) => <p key={i} className={clsx(i < lvl ? (i === lvl - 1 ? 'text-[#ffe6a8]' : '') : 'text-white/30')}>{i + 1}. {i < lvl ? s : '…'}</p>)}</Note>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 rounded-xl px-3 py-2 text-[12.5px] font-display leading-snug space-y-1" style={{ background: 'rgba(255,199,44,.08)', border: '1px solid rgba(255,199,44,.25)', color: '#dfe3ff' }}>{children}</div>;
}
