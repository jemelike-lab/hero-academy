function shuffle(a){var c=[...new Set(a)];for(var i=c.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));[c[i],c[j]]=[c[j],c[i]];}return c;}
var MATH_SKILLS={
"add_within_10":{id:"add_within_10",name:"Addition within 10",unit:"Unit 2.1",standard:"2.OA.B.2",prerequisite:null,nextSkill:"subtract_within_10",masteryCount:5,
workedExample:{problem:"3 + 4 = ?",explanation:"Start with 3 in your head. Count up 4 more: 4, 5, 6, 7. So 3 + 4 = 7.",visualHint:"Three fingers on one hand, four on the other!"},
walkthrough:function(p){var m=p.question.match(/(\d+)\s*\+\s*(\d+)/);if(!m)return"The answer is "+p.answer+".";var a=Math.max(+m[1],+m[2]),b=Math.min(+m[1],+m[2]),s=[];for(var n=a,i=0;i<b;i++){n++;s.push(n);}return"Start with the bigger number, <strong>"+a+"</strong>. Count up <strong>"+b+"</strong> more: "+s.join(", ")+". So "+m[1]+" + "+m[2]+" = <strong>"+p.answer+"</strong>.";},
generate:function(){var a=Math.floor(Math.random()*9)+1,b=Math.floor(Math.random()*(10-a))+1;return{question:a+" + "+b+" = ?",answer:a+b,choices:shuffle([a+b,a+b+1,a+b-1,a+b+2].filter(function(x){return x>=0;}))};},
hints:["Try counting up from the bigger number.","Use your fingers!","Let's count together: start at the bigger number…"]},

"subtract_within_10":{id:"subtract_within_10",name:"Subtraction within 10",unit:"Unit 2.1",standard:"2.OA.B.2",prerequisite:"add_within_10",nextSkill:"make_10",masteryCount:5,
workedExample:{problem:"8 - 3 = ?",explanation:"Start with 8. Count backwards 3: 7, 6, 5. So 8 - 3 = 5.",visualHint:"Eight cookies. Eat three. How many left?"},
walkthrough:function(p){var m=p.question.match(/(\d+)\s*-\s*(\d+)/);if(!m)return"The answer is "+p.answer+".";var a=+m[1],b=+m[2],s=[];for(var n=a,i=0;i<b;i++){n--;s.push(n);}return"Start with <strong>"+a+"</strong>. Count backwards <strong>"+b+"</strong> times: "+s.join(", ")+". So "+a+" - "+b+" = <strong>"+p.answer+"</strong>.";},
generate:function(){var a=Math.floor(Math.random()*9)+1,b=Math.floor(Math.random()*a)+1;return{question:a+" - "+b+" = ?",answer:a-b,choices:shuffle([a-b,a-b+1,Math.max(0,a-b-1),a-b+2])};},
hints:["Count backwards from the first number.","Picture having that many — take some away.","Use your fingers: put up the first, fold down the second."]},

"make_10":{id:"make_10",name:"Make 10 strategy",unit:"Unit 2.1",standard:"2.OA.B.2",prerequisite:"subtract_within_10",nextSkill:"add_within_20",masteryCount:5,
workedExample:{problem:"8 + 5 = ?",explanation:"How many does 8 need to make 10? Just 2. Take 2 from the 5, leaving 3. 10 + 3 = 13.",visualHint:""},
generate:function(){var a=[7,8,9][Math.floor(Math.random()*3)],b=Math.floor(Math.random()*(11-a))+(10-a+1);return{question:a+" + "+b+" = ?",answer:a+b,choices:shuffle([a+b,a+b+1,a+b-1,10])};},
hints:["How many more does the first number need to reach 10?","Split the second number.","Step 1: get to 10. Step 2: add what's left."]},

"add_within_20":{id:"add_within_20",name:"Addition within 20",unit:"Unit 2.1",standard:"2.OA.B.2",prerequisite:"make_10",nextSkill:"subtract_within_20",masteryCount:5,
workedExample:{problem:"9 + 7 = ?",explanation:"Make 10! 9 needs 1 to make 10. Take 1 from the 7, leaving 6. 10 + 6 = 16.",visualHint:""},
generate:function(){var a=Math.floor(Math.random()*11)+5,b=Math.floor(Math.random()*(20-a))+1;return{question:a+" + "+b+" = ?",answer:a+b,choices:shuffle([a+b,a+b+1,a+b-1,a+b+10])};},
hints:["Use the make-10 strategy.","Count up from the bigger number.","If 9+7 is hard, think 10+6."]},

"subtract_within_20":{id:"subtract_within_20",name:"Subtraction within 20",unit:"Unit 2.1",standard:"2.OA.B.2",prerequisite:"add_within_20",nextSkill:"doubles",masteryCount:5,
workedExample:{problem:"15 - 8 = ?",explanation:"Think backwards: 8 + ? = 15. Need 7 more. So 15 - 8 = 7.",visualHint:""},
generate:function(){var a=Math.floor(Math.random()*11)+10,b=Math.floor(Math.random()*9)+2;return{question:a+" - "+b+" = ?",answer:a-b,choices:shuffle([a-b,a-b+1,a-b-1,a+b])};},
hints:["Think: what plus that number equals the first?","Count up from the smaller to the bigger."]},

"doubles":{id:"doubles",name:"Doubles facts",unit:"Unit 2.1",standard:"2.OA.B.2",prerequisite:"subtract_within_20",nextSkill:"doubles_plus_one",masteryCount:5,
workedExample:{problem:"6 + 6 = ?",explanation:"Doubles are equal pairs. 6 + 6 = 12. Memorize these!",visualHint:""},
generate:function(){var a=Math.floor(Math.random()*10)+1;return{question:a+" + "+a+" = ?",answer:a*2,choices:shuffle([a*2,a*2+1,a*2-1,a+1])};},
hints:["Same number plus itself.","Like twins — two of the same.","5+5=10. 6+6=12. 7+7=14."]},

"doubles_plus_one":{id:"doubles_plus_one",name:"Doubles plus one",unit:"Unit 2.1",standard:"2.OA.B.2",prerequisite:"doubles",nextSkill:"fact_families",masteryCount:5,
workedExample:{problem:"6 + 7 = ?",explanation:"6+7 is like 6+6+1. 6+6=12. Add 1: 13.",visualHint:""},
generate:function(){var a=Math.floor(Math.random()*9)+1,b=a+1;return{question:a+" + "+b+" = ?",answer:a+b,choices:shuffle([a+b,a+b+1,a+b-1,a*2])};},
hints:["Notice the numbers are neighbors.","Double the smaller, add 1."]},

"fact_families":{id:"fact_families",name:"Fact families",unit:"Unit 2.1",standard:"2.OA.B.2",prerequisite:"doubles_plus_one",nextSkill:"count_to_100",masteryCount:5,
workedExample:{problem:"If 3+4=7, what is 7-3?",explanation:"Fact families: 3,4,7 make 4 facts: 3+4=7, 4+3=7, 7-3=4, 7-4=3.",visualHint:""},
generate:function(){var a=Math.floor(Math.random()*8)+2,b=Math.floor(Math.random()*8)+2,s=a+b;var f=[{q:"If "+a+"+"+b+"="+s+", what is "+s+"-"+a+"?",ans:b},{q:"If "+a+"+"+b+"="+s+", what is "+s+"-"+b+"?",ans:a}];var r=f[Math.floor(Math.random()*f.length)];return{question:r.q,answer:r.ans,choices:shuffle([r.ans,r.ans+1,r.ans-1,r.ans+2])};},
hints:["Same 3 numbers make 4 math sentences.","If you know one fact, you know them all."]},

"count_to_100":{id:"count_to_100",name:"Count to 100",unit:"Unit 2.2",standard:"2.NBT.A.2",prerequisite:"fact_families",nextSkill:"place_value_2digit",masteryCount:5,
workedExample:{problem:"What comes after 47?",explanation:"47, then 48. Numbers go up by 1.",visualHint:""},
generate:function(){var n=Math.floor(Math.random()*98)+1;return{question:"What comes after "+n+"?",answer:n+1,choices:shuffle([n+1,n+2,n-1,n+10])};},
hints:["Add 1 to the number.","Count up by one."]},

"place_value_2digit":{id:"place_value_2digit",name:"Place value (2-digit)",unit:"Unit 2.2",standard:"2.NBT.A.1",prerequisite:"count_to_100",nextSkill:"place_value_3digit",masteryCount:5,
workedExample:{problem:"In 47, the 4 is in the ___ place.",explanation:"47 = 4 tens + 7 ones. The 4 is TENS. The 7 is ONES.",visualHint:""},
generate:function(){var n=Math.floor(Math.random()*89)+10,t=Math.floor(n/10),o=n%10,w=Math.random()<0.5?"tens":"ones";return{question:"In "+n+", what digit is in the "+w+" place?",answer:w==="tens"?t:o,choices:shuffle([t,o,t+1,o+1].filter(function(v,i,a){return a.indexOf(v)===i;}))};},
hints:["Tens=LEFT digit. Ones=RIGHT digit."]},

"place_value_3digit":{id:"place_value_3digit",name:"Place value (3-digit)",unit:"Unit 2.2",standard:"2.NBT.A.1",prerequisite:"place_value_2digit",nextSkill:"expanded_form",masteryCount:5,
workedExample:{problem:"In 347, the 3 is in the ___ place.",explanation:"347 = 3 hundreds + 4 tens + 7 ones.",visualHint:""},
generate:function(){var n=Math.floor(Math.random()*899)+100,h=Math.floor(n/100),t=Math.floor((n%100)/10),o=n%10,ps=["hundreds","tens","ones"],w=ps[Math.floor(Math.random()*3)],ans=w==="hundreds"?h:w==="tens"?t:o;return{question:"In "+n+", what digit is in the "+w+" place?",answer:ans,choices:shuffle([h,t,o,ans].filter(function(v,i,a){return a.indexOf(v)===i;}))};},
hints:["Three places: hundreds (left), tens (middle), ones (right)."]},

"expanded_form":{id:"expanded_form",name:"Expanded form",unit:"Unit 2.2",standard:"2.NBT.A.3",prerequisite:"place_value_3digit",nextSkill:"compare_numbers",masteryCount:5,
workedExample:{problem:"Write 347 in expanded form.",explanation:"347 = 300 + 40 + 7.",visualHint:""},
generate:function(){var n=Math.floor(Math.random()*899)+100,h=Math.floor(n/100)*100,t=Math.floor((n%100)/10)*10,o=n%10,c=h+" + "+t+" + "+o;return{question:n+" in expanded form is:",answer:c,choices:shuffle([c,h+" + "+(t/10)+" + "+o,(h/10)+" + "+t+" + "+o,Math.floor(n/100)+" + "+Math.floor((n%100)/10)+" + "+o])};},
hints:["Each digit times its place value.","Hundreds, tens, ones."]},

"compare_numbers":{id:"compare_numbers",name:"Compare numbers",unit:"Unit 2.2",standard:"2.NBT.A.4",prerequisite:"expanded_form",nextSkill:"add_2digit_no_regroup",masteryCount:5,
workedExample:{problem:"347 ___ 374",explanation:"Both have 3 hundreds. Tens: 4 vs 7. 4<7. So 347 < 374.",visualHint:"Alligator eats the bigger number!"},
generate:function(){var a=Math.floor(Math.random()*899)+100,b;do{b=Math.floor(Math.random()*899)+100;}while(b===a);var c=a<b?"<":a>b?">":"=";return{question:a+" ___ "+b,answer:c,choices:["<",">","="]};},
hints:["Compare hundreds first, then tens, then ones.","Alligator eats the bigger number."]},

"add_2digit_no_regroup":{id:"add_2digit_no_regroup",name:"Add 2-digit (no regrouping)",unit:"Unit 2.3",standard:"2.NBT.B.5",prerequisite:"compare_numbers",nextSkill:"add_2digit_regroup",masteryCount:5,
workedExample:{problem:"34 + 25 = ?",explanation:"Ones: 4+5=9. Tens: 3+2=5. Answer: 59.",visualHint:""},
generate:function(){var at=Math.floor(Math.random()*7)+1,ao=Math.floor(Math.random()*5)+1,bt=Math.floor(Math.random()*7)+1,bo=Math.floor(Math.random()*(9-ao))+1,a=at*10+ao,b=bt*10+bo;return{question:a+" + "+b+" = ?",answer:a+b,choices:shuffle([a+b,a+b+1,a+b-10,a+b+10])};},
hints:["Add ones first.","Then add tens.","Put them together."]},

"add_2digit_regroup":{id:"add_2digit_regroup",name:"Add 2-digit (WITH regrouping)",unit:"Unit 2.3",standard:"2.NBT.B.5",prerequisite:"add_2digit_no_regroup",nextSkill:"subtract_2digit_no_regroup",masteryCount:5,
workedExample:{problem:"27 + 38 = ?",explanation:"Ones: 7+8=15. Write 5, carry 1. Tens: 1+2+3=6. Answer: 65.",visualHint:""},
generate:function(){var at=Math.floor(Math.random()*6)+1,ao=Math.floor(Math.random()*5)+5,bt=Math.floor(Math.random()*6)+1,bo=Math.floor(Math.random()*5)+5,a=at*10+ao,b=bt*10+bo;return{question:a+" + "+b+" = ?",answer:a+b,choices:shuffle([a+b,a+b-10,a+b+10,a+b-1])};},
hints:["Ones first: do they add to 10+?","Write down ones digit, carry the 1.","Then add tens with the carried 1."]},

"subtract_2digit_no_regroup":{id:"subtract_2digit_no_regroup",name:"Subtract 2-digit (no borrowing)",unit:"Unit 2.4",standard:"2.NBT.B.5",prerequisite:"add_2digit_regroup",nextSkill:"subtract_2digit_regroup",masteryCount:5,
workedExample:{problem:"58 - 23 = ?",explanation:"Ones: 8-3=5. Tens: 5-2=3. Answer: 35.",visualHint:""},
generate:function(){var at=Math.floor(Math.random()*7)+2,ao=Math.floor(Math.random()*5)+5,bt=Math.floor(Math.random()*at)+1,bo=Math.floor(Math.random()*ao)+1,a=at*10+ao,b=bt*10+bo;return{question:a+" - "+b+" = ?",answer:a-b,choices:shuffle([a-b,a-b+1,a-b-1,a+b])};},
hints:["Subtract ones first, then tens."]},

"subtract_2digit_regroup":{id:"subtract_2digit_regroup",name:"Subtract 2-digit (with borrowing)",unit:"Unit 2.4",standard:"2.NBT.B.5",prerequisite:"subtract_2digit_no_regroup",nextSkill:null,masteryCount:5,
workedExample:{problem:"62 - 27 = ?",explanation:"Ones: 2-7? Can't. Borrow: 6 becomes 5, 2 becomes 12. 12-7=5. Tens: 5-2=3. Answer: 35.",visualHint:""},
generate:function(){var at=Math.floor(Math.random()*7)+2,ao=Math.floor(Math.random()*4)+1,bt=Math.floor(Math.random()*(at-1))+1,bo=Math.floor(Math.random()*4)+5,a=at*10+ao,b=bt*10+bo;return{question:a+" - "+b+" = ?",answer:a-b,choices:shuffle([a-b,a-b+10,a-b-1,bo-ao])};},
hints:["Top ones smaller than bottom? Borrow from tens.","Tens lends a 10 to ones.","After borrowing, ones digit gets 10 bigger, tens gets 1 smaller."]}
};
var MATH_SKILL_ORDER=["add_within_10","subtract_within_10","make_10","add_within_20","subtract_within_20","doubles","doubles_plus_one","fact_families","count_to_100","place_value_2digit","place_value_3digit","expanded_form","compare_numbers","add_2digit_no_regroup","add_2digit_regroup","subtract_2digit_no_regroup","subtract_2digit_regroup"];
if(typeof window!=="undefined"){window.MATH_SKILLS=MATH_SKILLS;window.MATH_SKILL_ORDER=MATH_SKILL_ORDER;}