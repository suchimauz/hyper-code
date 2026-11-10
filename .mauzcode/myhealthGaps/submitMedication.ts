// Resolves an actual local wall time to its unique instant (formerly flow.localInstant; the flow plugin is removed).
function localInstant(opts:{value:string;timezone:string;now:string;min?:string}):{instant?:string;error?:string}{
 const fail=(error:string)=>({error});
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(opts.value))return fail('Введите дату и время полностью.');
 const wall=Date.parse(opts.value+'Z');
 if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,16)!==opts.value)return fail('Такой даты или времени нет.');
 if(opts.min&&opts.value.slice(0,10)<opts.min)return fail('Дата раньше начала текущего назначения: '+opts.min+'.');
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:opts.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const local=(t:number)=>{const p=Object.fromEntries(fmt.formatToParts(new Date(t)).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;};
 const matches:number[]=[];
 for(let offset=-14*60;offset<=14*60;offset++){const t=wall+offset*60000;if(local(t)===opts.value)matches.push(t);}
 if(matches.length===0)return fail('Это местное время не существует из-за перевода часов. Укажите фактическое время.');
 if(matches.length>1)return fail('Это время повторяется при переводе часов. Форма не может выбрать смещение: запись не сохранена; нужна запись с явным UTC-смещением.');
 if(!Number.isFinite(Date.parse(opts.now))||matches[0]!>Date.parse(opts.now))return fail('Будущее время нельзя записать как уже состоявшийся приём.');
 return{instant:new Date(matches[0]!).toISOString()};
}
/** Records a confirmed intake and returns a structured outcome without rendering card HTML. */
export default async function(ctx:Context,_session:Session|null,opts:{
 /** Trusted submit request after generic validation and idempotency reservation. */ request:Extract<types.flow.FlowRequest,{mode:'submit'}>;
}):Promise<types.flow.FlowOutput>{
 const r=opts.request,flow='medication',data=await ctx.fns.myhealthGaps.medicationContext({}),gaps=await ctx.fns.myhealthGaps.medicationRecordGaps({now:r.now,...data}),gap=gaps.find(g=>g.id===r.target.id);
 if(!gap||gap.revision!==r.target.revision)return{receipt:{status:'stale',message:'Ничего не записано: данные изменились. Проверьте актуальную карточку.'}};
 if(r.action!=='record-intake'||Object.keys(r.values).some(k=>!['takenAt','comment'].includes(k)))throw new Error('Unsupported intake action or fields');
 const comment=(r.values.comment??'').trim();if(comment.length>1000||comment.includes('\0'))return{receipt:{status:'validation',message:'Проверьте комментарий.',values:r.values,errors:{comment:'Не более 1000 символов, без нулевых символов.'}}};
 const med=data.medications.find(m=>m.id===gap.facts?.medicationId);if(!med||med.dose?.value===undefined||!med.dose.unit)throw new Error('Current regimen dose unavailable');
 const checked=localInstant({value:r.values.takenAt!,timezone:data.timezone,now:r.now,min:med.start?.slice(0,10)});if(!checked.instant)return{receipt:{status:'validation',message:'Проверьте время.',values:r.values,errors:{takenAt:checked.error??'Invalid time'}}};
 const saved=await ctx.fns.healthrepo.recordMedicationIntake({medicationId:med.id,medicationName:med.name,takenAt:checked.instant,dose:med.dose.value,unit:med.dose.unit,comment,submissionId:r.submissionId});
 const current=await ctx.fns.myhealthGaps.medicationContext({}),after=await ctx.fns.myhealthGaps.medicationRecordGaps({now:r.now,...current}),remains=after.find(g=>g.id===r.target.id),display=r.values.takenAt!.replace('T',' ')+' ('+data.timezone+')';
 return{effects:[{reference:'MedicationAdministration/'+saved.id,label:'Confirmed actual intake'}],receipt:{status:remains?'remains':'closed',message:(saved.created?'Приём сохранён: ':'Такая запись уже существует: ')+display+'. '+(remains?'Карточка остаётся открытой.':'Запись за день подтверждена. Карточка закрыта.')}};
}
