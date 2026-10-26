import { pickManipulative, type ParsedEquation } from './parseEquation';
import TenFrame from './TenFrame';
import NumberLine from './NumberLine';
import BaseTenBlocks from './BaseTenBlocks';

// show=true: Humphrey drives it (animates the step). show=false: the kid can poke it.
export default function Manipulative({ eq, show, compact }: { eq: ParsedEquation; show: boolean; compact?: boolean }) {
  const kind = pickManipulative(eq);
  if (kind === 'ten-frame') return <TenFrame a={eq.a} b={eq.b} show={show} compact={compact} />;
  if (kind === 'number-line') return <NumberLine a={eq.a} b={eq.b} op={eq.op} show={show} compact={compact} />;
  return <BaseTenBlocks a={eq.a} b={eq.b} show={show} compact={compact} />;
}
