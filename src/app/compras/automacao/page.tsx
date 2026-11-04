import {getAutomation} from '@/lib/compras/automacao-actions';
import AutomationClient from './planejamento-client';
import '../operacao/operacao.css';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export default async function Page(){return <AutomationClient initial={await getAutomation()}/>;}
