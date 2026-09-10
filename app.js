/* ===========================================================
   杀戮尖塔 2 · 全卡牌图鉴  v2
   - 数据：从 cards.json 拉取
   - 修复了图标文本：能量/星辰的"N点X"会被渲染为彩色标签
   - 角色/类型/稀有度/费用 多选筛选 + 收藏
   - 搜索（按 / 聚焦、Esc 清空）
   - 详情弹窗：立绘 + 基础/升级对比 + 上一张/下一张 + 收藏 + 复制链接 + 哈希直链
   - 卡名接龙：保留原 WebSocket 逻辑
   =========================================================== */

const APP = {
  CARDS: [],
  meta: null,
  results: [],
  shown: 0,
  currentIndex: -1, // current open card index in `results`
};

let CHAR_CN = {ironclad:'铁甲战士',silent:'静默猎手',defect:'故障机器人',necrobinder:'亡灵契约师',regent:'储君',watcher:'观者',colorless:'无色',event:'事件',status:'状态',curse:'诅咒',quest:'任务',derivative:'衍生'};
let TYPE_CN = {attack:'攻击',skill:'技能',power:'能力',status:'状态',curse:'诅咒',quest:'任务'};
let RARE_CN = {starter:'初始',common:'普通',uncommon:'罕见',rare:'稀有',special:'特殊',event:'事件',elder:'先古之民',status:'状态',curse:'诅咒',quest:'任务',token:'衍生'};
let CHAR_ORDER = ['ironclad','silent','regent','necrobinder','defect','colorless','event','status','curse','quest','derivative'];
let TYPE_ORDER = ['attack','skill','power','status','curse','quest'];
let RARE_ORDER = ['starter','common','uncommon','rare','special','event','elder','status','curse','quest','token'];
let RARE_RANK = {}; RARE_ORDER.forEach((k,i)=>RARE_RANK[k]=i);
const ART_BASE = ''; // StS2 立绘改为本地托管（art/<slug>.webp）；StS1 用绝对 http 不受影响
// 当前游戏与数据文件注册
let CUR = 'sts2';   // 当前游戏 id（sts2 / sts1）
const GAMES = {
  sts2: { file:'cards.json',  label:'杀戮尖塔 2', short:'2', logo:'S2', artBase:ART_BASE,
          footer:'STS2 中文 Wiki（sts2front） · Slay the Spire Wiki · 卡图：sts2front' },
  sts1: { file:'cards1.json', label:'杀戮尖塔 1', short:'1', logo:'S1', artBase:'',
          footer:'灰机wiki 杀戮尖塔 · sts.huijiwiki.com' },
};
const DATA = { sts2: null, sts1: null };   // 两款图鉴数据缓存（接龙对战名集合取二者并集）
const HIST = { sts2: null, sts1: null };
/* 版本历史数据（内联，避免部署把外部 .json/.js 数据文件传成 0 字节）*/
const HIST_STS2 = {"meta":{"game":"sts2","source":"Steam 官方补丁说明 (Slay the Spire 2, appid 2868840)","versions":["0.100.0","0.101.0","0.102.0","0.103.0","0.104.0","0.105.0","0.106.0","0.107.0","0.107.1","0.108.0","0.109.0","0.110.0","0.111.0"],"updated":"2026-09-09","count":155,"changes":233},"cards":{"dominate":{"cn":"主宰","char":"ironclad","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"change","kindCn":"调整","zh":"稀有度从罕见升为稀有","en":"rarity increased from Uncommon -> Rare"},{"ver":"0.100.0","date":"2026-03-20","kind":"rework","kindCn":"重做","zh":"技能牌 - 消耗 1 - 罕见 -「施加 1(2) 层易伤。敌方每有 1 层易伤，你获得 1 点力量。耗尽。」","en":"Skill - Cost 1 - Uncommon - \"Apply 1(2) Vulnerable. Gain 1 Strength for each Vulnerable on the enemy. Exhaust.\""}]},"expect-a-fight":{"cn":"跃跃欲试","char":"ironclad","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"rework","kindCn":"重做","zh":"由 罕见 - 技能牌 - 消耗 2(1) -「手牌中每有 1 张攻击牌，获得 1 点能量。本回合你无法额外获得能量。」改为 罕见 - 技能牌 - 消耗 3 -「获得 15(16) 点格挡。每有 1 点力量，额外获得 5(8) 点格挡。」","en":"from Uncommon - Skill - Cost 2(1) - \"Gain 1 Energy for each Attack in your Hand. You cannot gain additional Energy this turn.\" → Uncommon - Skill - Cost 3 - \"Gain 15(16) Block. Gains 5(8) additional Block for each Strength you have.\""},{"ver":"0.109.0","date":"2026-07-17","kind":"buff","kindCn":"增强","zh":"不再有「本回合你无法额外获得能量」的限制","en":"no longer says \"You cannot gain additional Energy this turn.\""},{"ver":"0.100.0","date":"2026-03-20","kind":"rework","kindCn":"重做","zh":"技能牌 - 消耗 2(1) - 罕见 -「手牌中每有 1 张攻击牌，获得 1 点能量。本回合你无法额外获得能量。」","en":"Skill - Cost 2(1) - Uncommon - \"Gain Energy for each Attack in your Hand. You cannot gain additional Energy this turn.\""}]},"spite":{"cn":"怨恨","char":"ironclad","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"rework","kindCn":"重做","zh":"攻击牌 - 消耗 0 - 罕见 -「造成 5 点伤害。若本回合你损失过生命值，攻击 2(3) 次。」","en":"Cost 0 - Attack - Uncommon - \"Deal 5 damage. If you lost HP this turn, hits 2(3) times.\""}]},"stoke":{"cn":"添柴","char":"ironclad","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"rework","kindCn":"重做","zh":"技能牌 - 消耗 1 - 稀有 -「耗尽所有手牌。每耗尽 1 张牌，随机将 1 张（升级后的）牌加入手牌。」","en":"Skill - Cost 1 - Rare - \"Exhaust your Hand. Add 1 random (Upgraded) card into your Hand for each card Exhausted.\""}]},"glow":{"cn":"辉光","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"rework","kindCn":"重做","zh":"技能牌 - 消耗 1 - 普通 -「获得 1(2) 颗星辰。抽 1 张牌。下一回合，抽 1 张牌。」","en":"Skill - Cost 1 - Common - \"Gain 1(2) Stars. Draw 1 card. Next turn, draw 1 card.\""}]},"hidden-gem":{"cn":"未掘宝石","char":"colorless","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"rework","kindCn":"重做","zh":"技能牌 - 消耗 1 -「抽牌堆中 1 张没有再施放效果的随机牌，获得再施放 2(3)。」","en":"Skill - Cost 1 - \"A random card in your Draw Pile without Replay gains Replay 2(3).\""},{"ver":"0.100.0","date":"2026-03-20","kind":"change","kindCn":"调整","zh":"无法再通过技能药水等效果在战斗中生成","en":"can no longer be generated in combat by effects like Skill Potion"}]},"break":{"cn":"破击","char":"ironclad","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"能量消耗从 2 降至 1伤害从 20(25) 提升至 20(30)","en":"Energy cost decreased from 2 -> 1 Damage increased from 20(25) -> 20(30)"}]},"cinder":{"cn":"余烬","char":"ironclad","list":[{"ver":"0.101.0","date":"2026-03-27","kind":"buff","kindCn":"增强","zh":"现在耗尽手牌中的随机 1 张牌，而非抽牌堆顶部的牌","en":"now Exhausts a random card in your Hand instead of the top card of the Draw Pile"},{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 17(22) 提升至 18(24)","en":"Damage increased from 17(22) -> 18(24)"}]},"fight-me":{"cn":"与我一战！","char":"ironclad","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"自身力量获得从 2(3) 提升至 3(4)","en":"self-Strength gain from 2(3) -> 3(4)"}]},"forgotten-ritual":{"cn":"被遗忘的仪式","char":"ironclad","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"buff","kindCn":"增强","zh":"不再需要耗尽一张牌才能获得能量","en":"no longer requires a card to be Exhausted to gain Energy"},{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"新增耗尽效果","en":"now Exhausts"}]},"hemokinesis":{"cn":"御血术","char":"ironclad","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 14(19) 提升至 15(20)","en":"Damage increased from 14(19) -> 15(20)"}]},"tremble":{"cn":"战栗","char":"ironclad","list":[{"ver":"0.101.0","date":"2026-03-27","kind":"change","kindCn":"调整","zh":"新增耗尽效果","en":"now Exhausts"},{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"易伤从 2(3) 提升至 3(4)","en":"Vulnerable increased from 2(3) -> 3(4)"}]},"anticipate":{"cn":"预判","char":"silent","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"buff","kindCn":"增强","zh":"敏捷从 2(3) 提升至 2(4)","en":"Dexterity increased from 2(3) → 2(4)"},{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"敏捷从 3(5) 降至 2(3)","en":"Dexterity decreased from 3(5) -> 2(3)"}]},"corrosive-wave":{"cn":"腐蚀波","char":"silent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"中毒从 3(4) 降至 2(3)","en":"Poison decreased from 3(4) -> 2(3)"}]},"flick-flack":{"cn":"翻越撑击","char":"silent","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"buff","kindCn":"增强","zh":"伤害从 6(8) 提升至 7(9)","en":"damage increased from 6(8) → 7(9)"},{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"伤害从 7(9) 降至 6(8)","en":"Damage decreased from 7(9) -> 6(8)"}]},"grand-finale":{"cn":"华丽收场","char":"silent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 50(60) 提升至 60(75)","en":"Damage increased from 50(60) -> 60(75)"}]},"pinpoint":{"cn":"精密瞄准","char":"silent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"伤害从 17(22) 降至 15(19)","en":"Damage decreased from 17(22) -> 15(19)"}]},"skewer":{"cn":"串刺","char":"silent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 7(10) 提升至 8(11)","en":"Damage increased from 7(10) -> 8(11)"}]},"untouchable":{"cn":"触不可及","char":"silent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"升级后的格挡获得从 +2 提升至 +3","en":"upgraded Block gain increased from +2 -> +3"},{"ver":"0.104.0","date":"2026-04-24","kind":"buff","kindCn":"增强","zh":"升级后的格挡获得从 +2 提升至 +3","en":"upgraded Block gain increased From +2 -> +3"},{"ver":"0.102.0","date":"2026-04-03","kind":"nerf","kindCn":"削弱","zh":"格挡从 7(9) 降至 6(8)","en":"Block decreased from 7(9) -> 6(8)"},{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"格挡从 9(12) 降至 7(9)","en":"Block gain decreased from 9(12) -> 7(9)"}]},"alignment":{"cn":"星位序列","char":"regent","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"buff","kindCn":"增强","zh":"星辰消耗从 3 降至 2","en":"Star cost decreased from 3 → 2"},{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"星辰消耗从 2 提升至 3","en":"Star cost increased from 2 -> 3"}]},"begone":{"cn":"下去！","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"change","kindCn":"调整","zh":"改为技能牌，不再造成伤害；改为生成仆从打击牌，而非仆从俯冲轰炸牌","en":"Now a Skill that no longer deals damage Now creates Minion Strike instead of Minion Dive Bomb"}]},"bundle-of-joy":{"cn":"新生之喜","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"能量消耗从 2 降至 1","en":"Energy cost lowered from 2 -> 1"}]},"charge":{"cn":"冲锋！！","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"change","kindCn":"调整","zh":"改为生成仆从俯冲轰炸牌，而非仆从打击牌","en":"now creates Minion Dive Bomb cards instead of Minion Strike cards"}]},"collision-course":{"cn":"碰撞轨迹","char":"regent","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"nerf","kindCn":"削弱","zh":"伤害从 11(15) 降至 10(14)","en":"damage decreased from 11(15) -> 10(14)"},{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 9(12) 提升至 11(15)","en":"Damage increased from 9(12) -> 11(15)"}]},"gather-light":{"cn":"收集光辉","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"格挡从 7(10) 提升至 8(11)","en":"Block increased from 7(10) -> 8(11)"}]},"heirloom-hammer":{"cn":"传承之锤","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 17(22) 提升至 20(25)","en":"Damage increased from 17(22) -> 20(25)"}]},"i-am-invincible":{"cn":"所向无敌","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"格挡从 9(12) 提升至 10(13)","en":"Block increased from 9(12) -> 10(13)"}]},"kingly-kick":{"cn":"王者之踢","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 24(30) 提升至 27(35)","en":"Damage increased from 24(30) -> 27(35)"}]},"kingly-punch":{"cn":"王者之拳","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"基础伤害从 8(8) 提升至 8(10)成长伤害从 3(5) 提升至 4(6)","en":"Base damage increased from 8(8) -> 8(10) Scaling damage increased from 3(5) -> 4(6)"}]},"minion-dive-bomb":{"cn":"仆从俯冲","char":"derivative","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"能量消耗从 1 降至 0","en":"Energy cost decreased from 1 -> 0"}]},"minion-strike":{"cn":"仆从打击","char":"derivative","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"伤害从 7(10) 降至 6(9)","en":"Damage decreased from 7(10) -> 6(9)"}]},"parry":{"cn":"招架","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"rework","kindCn":"重做","zh":"不再在你打出君王之刃时给予格挡，而是君王之刃直接获得 10(14) 点格挡，因此格挡会显示在刃上并受敏捷、脆弱等效果影响。同时略微重做剑圣：君王之刃现在获得再施放 1（原为额外攻击 1 次），可与招架配合","en":"instead of granting Block when you play Sovereign Blade, Sovereign Blade now gains 10(14) Block directly, so the Block shows on the Blade and is affected by powers like Dexterity and Frail Slightly reworked Sword Sage card: Sovereign Blade now gains Replay 1 (was: hits an additional time), which gives it synergy with Parry"},{"ver":"0.104.0","date":"2026-04-24","kind":"rework","kindCn":"重做","zh":"旧版：招架 - 罕见 - 能力牌 - 消耗 1 -「每当你打出君王之刃，获得 10(14) 点格挡。」新版：招架 - 罕见 - 能力牌 - 消耗 1 -「君王之刃现在直接获得 10(14) 点格挡。」这意味着招架的格挡会显示在君王之刃上，并受敏捷、脆弱等效果影响。","en":"Old: Parry - Uncommon - Power - Cost 1 - Whenever you play Sovereign Blade, gain 10(14) Block. New: Parry - Uncommon - Power - Cost 1 - Sovereign Blade now gains 10(14) Block. This means Parry's Block is displayed on the Sovereign Blade card and is now also affected by powers like Dexterity and Frail."},{"ver":"0.101.0","date":"2026-03-27","kind":"buff","kindCn":"增强","zh":"格挡从 8(11) 提升至 10(14)","en":"Block gain increased from 8(11) -> 10(14)"},{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"格挡从 6(9) 提升至 8(11)","en":"Block increased from 6(9) -> 8(11)"}]},"patter":{"cn":"星星点点","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"nerf","kindCn":"削弱","zh":"格挡从 9(11) 降至 8(10)","en":"Block gain decreased from 9(11) -> 8(10)"},{"ver":"0.105.0","date":"2026-05-08","kind":"nerf","kindCn":"削弱","zh":"格挡从 9(11) 降至 8(10)","en":"Block gain decreased from 9(11) -> 8(10)"},{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"格挡从 8(10) 提升至 9(11)","en":"Block increased from 8(10) -> 9(11)"}]},"solar-strike":{"cn":"太阳打击","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 8(9) 提升至 9(10)","en":"damage increased from 8(9) -> 9(10)"}]},"spoils-of-battle":{"cn":"战利品","char":"regent","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"buff","kindCn":"增强","zh":"锻造值从 5(8) 提升至 6(9)","en":"Forge increased from 5(8) → 6(9)"},{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"锻造值从 10(15) 提升至 12(17)","en":"Forge increased from 10(15) -> 12(17)"}]},"void-form":{"cn":"虚空形态","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"现在具有虚无；升级效果从 +1 张牌改为移除虚无","en":"Is now Ethereal Upgrade changed from +1 card -> losing Ethereal"}]},"wrought-in-war":{"cn":"战火铸就","char":"regent","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"锻造值从 5(7) 提升至 7(9)","en":"Forge increased from 5(7) -> 7(9)"}]},"banshees-cry":{"cn":"女妖之嚎","char":"necrobinder","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"消耗从 6 提升至 9(7) 升级 升级不再提升伤害","en":"Cost increased from 6 -> 9(7) Upgrade no longer increases damage"}]},"borrowed-time":{"cn":"预借时间","char":"necrobinder","list":[{"ver":"0.102.0","date":"2026-04-03","kind":"rework","kindCn":"重做","zh":"罕见 - 消耗 0 - 技能牌「对自己施加 3 层厄运。获得 1(2) 点能量。」改为 罕见 - 消耗 1 - 技能牌「获得 4(6) 点能量。本回合所有牌消耗 +1 点能量。」","en":"\"Uncommon - Cost 0 - Skill | Apply 3 Doom to yourself. Gain 1(2) Energy.\" -> \"Uncommon - Cost 1 - Skill | Gain 4(6) energy. Cards cost an additional energy this turn.\""},{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"自身厄运从 3(3) 提升至 6(3)；升级不再提升获得的能量","en":"Self-Doom increased from 3(3) -> 6(3) Energy gain no longer increases on Upgrade"}]},"capture-spirit":{"cn":"捕捉灵魂","char":"necrobinder","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"生命值损失从 3(4) 降至 2(3)；生成的灵魂数从 3(4) 降至 2(3)","en":"HP loss decreased from 3(4) -> 2(3) Souls generated decreased from 3(4) -> 2(3)"}]},"danse-macabre":{"cn":"死亡之舞","char":"necrobinder","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"格挡从 3(4) 提升至 4(6)","en":"Block increased from 3(4) -> 4(6)"}]},"debilitate":{"cn":"摧残","char":"necrobinder","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"nerf","kindCn":"削弱","zh":"减益持续回合从 3(4) 降至 2(3)","en":"debuff decreased from 3(4) turns -> 2(3) turns"},{"ver":"0.106.0","date":"2026-05-22","kind":"nerf","kindCn":"削弱","zh":"减益持续回合从 3(4) 降至 2(3)","en":"debuff decreased from 3(4) turns -> 2(3) turns"},{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 7(9) 提升至 10(12)","en":"Damage increased from 7(9) -> 10(12)"}]},"defy":{"cn":"违逆","char":"necrobinder","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"change","kindCn":"调整","zh":"升级不再提升虚弱层数，改为格挡 +3（原为 +1）","en":"upgrade no longer increases Weak, but increases Block by +3 instead of +1"}]},"dirge":{"cn":"挽歌","char":"necrobinder","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"新增耗尽效果","en":"now Exhausts"}]},"grave-warden":{"cn":"守墓人","char":"necrobinder","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"change","kindCn":"调整","zh":"升级效果从格挡 8(10) 改为 8(11)，且不再升级灵魂","en":"upgrade changed from 8(10) Block -> 8(11) Block and no longer upgrades the Soul"}]},"sculpting-strike":{"cn":"雕琢打击","char":"necrobinder","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 8(11) 提升至 9(12)","en":"Damage increased from 8(11) -> 9(12)"}]},"seance":{"cn":"降灵","char":"necrobinder","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"消耗从 0 提升至 1(0)；升级不再生成强化灵魂","en":"Cost increased from 0 -> 1(0) Upgrade no longer makes a Soul+"}]},"rocket-punch":{"cn":"火箭飞拳","char":"defect","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"nerf","kindCn":"削弱","zh":"「每当你生成一张状态牌，将此牌消耗降为 0 点能量，直到它被打出。」改为「每当你生成一张状态牌，将此牌消耗降低 1 点能量，直到它被打出。」","en":"\"Whenever you create a Status, reduce this card's cost to 0 Energy until played.\" -> \"Whenever you create a Status, reduce this card's cost by 1 Energy until played.\""},{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"减耗效果现在持续至该牌被打出，而非仅持续到本回合结束","en":"cost reduction effect now lasts until it is played, instead of just until the end of the turn"}]},"seeker-strike":{"cn":"探寻打击","char":"colorless","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"伤害从 6(9) 提升至 9(12)","en":"Damage increased from 6(9) -> 9(12)"}]},"discovery":{"cn":"发现","char":"colorless","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"change","kindCn":"调整","zh":"「本回合消耗 0 点能量」改为「本回合可免费打出」；即生成的牌若有星辰消耗，本回合该消耗也会降为 0","en":"\"It costs 0 Energy this turn.\" -> \"It's free to play this turn.\" This means that, if the card it generates has a Star cost, this cost is now also reduced to 0 this turn"}]},"eternal-armor":{"cn":"永恒铠甲","char":"colorless","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"镀层从 7(9) 提升至 9(12)","en":"Plating increased from 7(9) -> 9(12)"}]},"production":{"cn":"生产制造","char":"colorless","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"change","kindCn":"调整","zh":"升级效果从移除耗尽改为额外 +1 点能量","en":"upgrade changed from losing Exhaust -> +1 additional Energy"}]},"neows-fury":{"cn":"涅奥之怒","char":"event","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"现在可以自行选择从弃牌堆回手的 2 张（或更少）牌，不再随机选取","en":"now lets you choose which 2 cards (or fewer) to return from your Discard Pile instead of selecting randomly"},{"ver":"0.104.0","date":"2026-04-24","kind":"buff","kindCn":"增强","zh":"不再随机选取，改为允许你自行选择从弃牌堆放回手牌的 2 张牌（也可以只选 1 张或更少）","en":"instead of selecting randomly now allows you to choose which 2 cards will be put into your Hand from your Discard Pile (you may also now choose fewer than 2 cards if you want)"},{"ver":"0.100.0","date":"2026-03-20","kind":"buff","kindCn":"增强","zh":"回手的卡牌数升级后从 2 张增至 3 张","en":"the number of cards returned to your hand now upgrades from 2 -> 3"}]},"beacon-of-hope":{"cn":"希望灯塔","char":"colorless","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"nerf","kindCn":"削弱","zh":"消耗从 1 提升至 2","en":"cost increased from 1 → 2"},{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"效果无法叠加","en":"can no longer be stacked"}]},"believe-in-you":{"cn":"相信着你","char":"colorless","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"能量从 3(4) 降至 2(3)","en":"Energy decreased from 3(4)-> 2(3)"}]},"huddle-up":{"cn":"抱团","char":"colorless","list":[{"ver":"0.100.0","date":"2026-03-20","kind":"nerf","kindCn":"削弱","zh":"新增耗尽效果","en":"now Exhausts"}]},"arsenal":{"cn":"武器库","char":"regent","list":[{"ver":"0.101.0","date":"2026-03-27","kind":"rework","kindCn":"重做","zh":"能力牌 - 稀有 - 消耗 1「每当你打出一张无色牌，获得 1(2) 点力量。」改为「（固有。）每当你生成一张牌，获得 1 点力量。」","en":"\"Power - Rare - Cost 1 Whenever you play a Colorless Card, gain 1(2) Strength.\" -> \"Power - Rare - Cost 1 (Innate.) Whenever you create a card, gain 1 Strength.\""}]},"serpent-form":{"cn":"群蛇形态","char":"silent","list":[{"ver":"0.101.0","date":"2026-03-27","kind":"buff","kindCn":"增强","zh":"伤害从 4(5) 提升至 4(6)","en":"Damage increased from 4(5) -> 4(6)"}]},"falling-star":{"cn":"陨星","char":"regent","list":[{"ver":"0.101.0","date":"2026-03-27","kind":"buff","kindCn":"增强","zh":"伤害从 7(11) 提升至 8(12)","en":"Damage increased from 7(11) -> 8(12)"}]},"glitterstream":{"cn":"流光溢彩","char":"regent","list":[{"ver":"0.101.0","date":"2026-03-27","kind":"buff","kindCn":"增强","zh":"下一回合的格挡从 4(6) 提升至 5(7)","en":"Next Turn Block increased from 4(6) -> 5(7)"}]},"refine-blade":{"cn":"淬炼刀刃","char":"regent","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"nerf","kindCn":"削弱","zh":"锻造值从 9(13) 降至 8(12)","en":"Forge decreased from 9(13) → 8(12)"},{"ver":"0.101.0","date":"2026-03-27","kind":"buff","kindCn":"增强","zh":"锻造值从 6(10) 提升至 9(13)","en":"Forge increased from 6(10) -> 9(13)"}]},"celestial-might":{"cn":"天穹之力","char":"regent","list":[{"ver":"0.101.0","date":"2026-03-27","kind":"buff","kindCn":"增强","zh":"升级效果从 +2 伤害改为额外攻击 1 次","en":"Upgrade changed from +2 damage -> 1 additional hit"}]},"guiding-star":{"cn":"引导之星","char":"regent","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"change","kindCn":"调整","zh":"抽牌时机从本回合改为下一回合；星辰消耗从 2 降至 1","en":"Card draw changed from this turn → next turn Star cost decreased from 2 → 1"},{"ver":"0.101.0","date":"2026-03-27","kind":"buff","kindCn":"增强","zh":"改为立即抽牌，而非下一回合再抽","en":"now draws cards immediately instead of next turn"}]},"sword-sage":{"cn":"剑圣","char":"regent","list":[{"ver":"0.101.0","date":"2026-03-27","kind":"buff","kindCn":"增强","zh":"不再提升君王之刃的消耗","en":"no longer increases the cost of Sovereign Blade"}]},"voltaic":{"cn":"电流相生","char":"defect","list":[{"ver":"0.101.0","date":"2026-03-27","kind":"nerf","kindCn":"削弱","zh":"能量消耗从 2 提升至 3","en":"Energy cost increased from 2 -> 3"}]},"blade-of-ink":{"cn":"墨之刃","char":"silent","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"nerf","kindCn":"削弱","zh":"墨附魔不再提供额外伤害（仍会施加虚弱）","en":"Inky enchantment no longer gives additional damage (still applies Weak)"},{"ver":"0.107.1","date":"2026-06-19","kind":"nerf","kindCn":"削弱","zh":"墨附魔的伤害加成从 +2 降至 +1","en":"Inky enchantment damage decreased from +2 -> +1"},{"ver":"0.105.0","date":"2026-05-08","kind":"nerf","kindCn":"削弱","zh":"墨附魔的伤害加成从 +2 降至 +1","en":"Inky enchantment damage decreased from +2 -> +1"},{"ver":"0.102.0","date":"2026-04-03","kind":"rework","kindCn":"重做","zh":"稀有 - 消耗 1 - 技能牌「本回合每打出一张攻击牌，获得 2(3) 点力量。」改为「将 2(3) 张墨刃飞刀加入手牌。」","en":"\"Rare - Cost 1 - Skill | This turn, whenever you play an Attack, gain 2(3) Strength this turn.\" -> \"Rare - Cost 1 - Skill - Add 2(3) Inky Shivs into your Hand.\""}]},"leading-strike":{"cn":"先制打击","char":"silent","list":[{"ver":"0.102.0","date":"2026-04-03","kind":"buff","kindCn":"增强","zh":"飞刀数量从 1 提升至 2；伤害从 7 降至 3","en":"Shivs increased from 1 -> 2 Damage decreased from 7 -> 3"}]},"speedster":{"cn":"速行者","char":"silent","list":[{"ver":"0.103.0","date":"2026-04-10","kind":"buff","kindCn":"增强","zh":"伤害从 1(2) 提升至 2；升级效果从 +1 伤害改为获得固有","en":"Damage increased from 1(2) -> 2 Upgrade changed from +1 damage -> Gains Innate"},{"ver":"0.102.0","date":"2026-04-03","kind":"nerf","kindCn":"削弱","zh":"伤害从 2(3) 降至 1(2)","en":"damage decreased from 2(3) -> 1(2)"}]},"colossus":{"cn":"巨像","char":"ironclad","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"nerf","kindCn":"削弱","zh":"格挡从 5(8) 提升至 4(7)","en":"Block gain increased from 5(8) → 4(7)"},{"ver":"0.103.0","date":"2026-04-10","kind":"change","kindCn":"调整","zh":"稀有度从稀有降为罕见","en":"rarity decreased from Rare -> Uncommon"}]},"acrobatics":{"cn":"杂技","char":"silent","list":[{"ver":"0.103.0","date":"2026-04-10","kind":"change","kindCn":"调整","zh":"稀有度从普通升为罕见","en":"rarity increased from Common -> Uncommon"}]},"follow-through":{"cn":"跟进","char":"silent","list":[{"ver":"0.103.0","date":"2026-04-10","kind":"rework","kindCn":"重做","zh":"罕见 - 攻击牌 - 消耗 1「对所有敌人造成 6(8) 点伤害。若本回合你打出的上一张牌是技能牌，对所有敌人施加 1(2) 层虚弱。」改为 普通 - 攻击牌 - 消耗 1「造成 7(9) 点伤害。若手牌中还有其他 5 张及以上牌，额外攻击 1 次。」","en":"\"Uncommon - Attack - Cost 1 | Deal 6(8) damage to ALL enemies. If the last card you played this turn was a Skill, apply 1(2) Weak to ALL enemies.\" -> \"Common - Attack - Cost 1 | Deal 7(9) damage. If you have 5 or more other cards in your Hand, hits an additional time.\""}]},"memento-mori":{"cn":"铭记死亡","char":"silent","list":[{"ver":"0.103.0","date":"2026-04-10","kind":"buff","kindCn":"增强","zh":"基础伤害从 8(10) 提升至 9(11)","en":"base damage increased from 8(10) -> 9(11)"}]},"conflagration":{"cn":"焚烧","char":"ironclad","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"rework","kindCn":"重做","zh":"现在对所有敌人造成 2 点伤害，攻击 4(5) 次（原为：8(9) 点范围伤害，外加本回合每打出 1 张其他攻击牌额外 2(3) 点）","en":"now deals 2 damage to ALL enemies 4(5) times (was: 8(9) AOE damage plus 2(3) per other Attack played this turn)"},{"ver":"0.104.0","date":"2026-04-24","kind":"rework","kindCn":"重做","zh":"旧版：焚烧 - 攻击牌 - 消耗 1 - 稀有 -「对所有敌人造成 8(9) 点伤害。本回合每打出 1 张其他攻击牌，额外造成 2(3) 点伤害。」新版：焚烧 - 攻击牌 - 消耗 1 - 稀有 -「对所有敌人造成 2 点伤害，攻击 4(5) 次。」","en":"Old: Conflagration - Attack - Cost 1 - Rare - Deal 8(9) damage to ALL enemies. Deals 2(3) additional damage for each other Attack you've played this turn. New: Conflagration - Attack - Cost 1 - Rare - Deal 2 damage to ALL enemies 4(5) times."}]},"drum-of-battle":{"cn":"战鼓","char":"ironclad","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"rework","kindCn":"重做","zh":"改为消耗 1 的罕见技能牌：抽 2 张牌，被耗尽时获得 2(3) 点能量（获得能量遵循再施放和复制药水等出牌复制效果）","en":"now a 1-cost Uncommon Skill that draws 2 cards and grants 2(3) Energy when Exhausted (the Energy gain respects Replay and card-duplication effects like Duplicator potion)"},{"ver":"0.106.0","date":"2026-05-22","kind":"buff","kindCn":"增强","zh":"耗尽时获得能量的效果现在遵循再施放，以及复制药水等出牌复制效果","en":"Energy gain on Exhaust effect now respects Replay and card play duplication effects like Duplicator potion"},{"ver":"0.104.0","date":"2026-04-24","kind":"rework","kindCn":"重做","zh":"旧版：战鼓 - 能力牌 - 消耗 0 - 罕见 -「抽 2(3) 张牌。每回合开始时，耗尽抽牌堆顶部的牌。」新版：战鼓 - 技能牌 - 消耗 1 - 罕见 -「抽 2 张牌。该牌被耗尽时，获得 2(3) 点能量。」","en":"Old: Drum of Battle - Power - Cost 0 - Uncommon - Draw 2(3) cards. At the start of your turn, Exhaust the top card of your Draw Pile. New: Drum of Battle - Skill - Cost 1 - Uncommon - Draw 2 cards. When this card is Exhausted, gain 2(3) Energy."}]},"nightmare":{"cn":"夜魇","char":"silent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"change","kindCn":"调整","zh":"若选择的牌带有异常状态，下一回合加入手牌的复制品上不再带有该异常","en":"if you select a card with an Affliction on it, that Affliction is now removed from the copies added to your hand the following turn"},{"ver":"0.104.0","date":"2026-04-24","kind":"change","kindCn":"调整","zh":"打出该牌并选择一张带异常状态的牌时，下一回合加入手牌的复制品上不再带有该异常","en":"if you play it and select a card with an Affliction on it, that Affliction is now removed from the copies added to your hand the following turn"}]},"tyranny":{"cn":"暴政","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"change","kindCn":"调整","zh":"现在在「轰击」牌之前触发（若暴政耗尽了轰击，轰击会紧接着立即打出）","en":"now triggers before Bombardment card (so if Tyranny Exhausts Bombardment, Bombardment is played immediately after)"},{"ver":"0.104.0","date":"2026-04-24","kind":"change","kindCn":"调整","zh":"现在在「轰击」牌之前触发；这意味着若暴政耗尽了轰击，轰击会紧接着立即打出","en":"now triggers before Bombardment card This means that if, for example, Tyranny exhausts Bombardment, Bombardment will be played immediately after"}]},"reflect":{"cn":"倒映","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"nerf","kindCn":"削弱","zh":"格挡从 17(21) 降至 15(20)","en":"Block gain decreased from 17(21) -> 15(20)"},{"ver":"0.107.0","date":"2026-06-04","kind":"nerf","kindCn":"削弱","zh":"格挡从 16(20) 降至 15(20)","en":"Block gain decreased from 16(20) -> 15(20)"},{"ver":"0.104.0","date":"2026-04-24","kind":"nerf","kindCn":"削弱","zh":"格挡从 17(21) 降至 16(20)","en":"Block decreased from 17(21) -> 16(20)"}]},"tag-team":{"cn":"双打组合","char":"colorless","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"再施放效果现在也会在「对所有敌人造成伤害」的攻击上触发","en":"Replay effect now triggers on \"deal damage to ALL enemies\" attacks too"},{"ver":"0.104.0","date":"2026-04-24","kind":"buff","kindCn":"增强","zh":"再施放效果现在也会在「对所有敌人造成伤害」的攻击上触发","en":"Replay effect now triggers on \"deal damage to ALL enemies\" attacks too"}]},"bulwark":{"cn":"铸墙","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"nerf","kindCn":"削弱","zh":"格挡从 13(16) 降至 12(15)","en":"Block decreased from 13(16) -> 12(15)"},{"ver":"0.105.0","date":"2026-05-08","kind":"nerf","kindCn":"削弱","zh":"格挡从 13(16) 降至 12(15)","en":"Block decreased from 13(16) -> 12(15)"}]},"crescent-spear":{"cn":"新月长矛","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"基础伤害从 6 提升至 8","en":"base damage increased from 6 -> 8"},{"ver":"0.105.0","date":"2026-05-08","kind":"buff","kindCn":"增强","zh":"基础伤害从 6 提升至 8","en":"base damage increased from 6 -> 8"}]},"royalties":{"cn":"王国资产","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"金币获得从 30(35) 提升至 30(40)","en":"Gold gain increased from 30(35) -> 30(40)"},{"ver":"0.105.0","date":"2026-05-08","kind":"buff","kindCn":"增强","zh":"金币获得从 30(35) 提升至 30(40)","en":"Gold Gain from 30(35) -> 30(40)"}]},"hyperbeam":{"cn":"超能光束","char":"defect","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"rework","kindCn":"重做","zh":"由「对所有敌人造成 30(38) 点伤害。失去 3 点专注。」改为「对所有敌人造成 24(30) 点伤害。本回合失去 3 点专注。」","en":"from \"Deal 30(38) damage to ALL enemies. Lose 3 Focus.\" → \"Deal 24(30) damage to ALL enemies. Lose 3 Focus this turn.\""},{"ver":"0.109.0","date":"2026-07-17","kind":"buff","kindCn":"增强","zh":"伤害从 28(36) 提升至 30(38)","en":"damage increased from 28(36) -> 30(38)"},{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"伤害从 26(34) 提升至 28(36)","en":"damage increased from 26(34) -> 28(36)"},{"ver":"0.105.0","date":"2026-05-08","kind":"buff","kindCn":"增强","zh":"伤害从 26(34) 提升至 28(36)","en":"damage increased from 26(34) -> 28(36)"}]},"shatter":{"cn":"打碎","char":"defect","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"change","kindCn":"调整","zh":"新增耗尽效果","en":"now Exhausts"},{"ver":"0.107.1","date":"2026-06-19","kind":"change","kindCn":"调整","zh":"现在会激发所有宝珠两次；伤害从 11(15) 降至 7(11)","en":"now Evokes all of your Orbs twice; damage decreased from 11(15) -> 7(11)"},{"ver":"0.106.0","date":"2026-05-22","kind":"nerf","kindCn":"削弱","zh":"伤害从 11(15) 降至 7(11)","en":"damage decreased from 11(15) -> 7(11)"},{"ver":"0.105.0","date":"2026-05-08","kind":"buff","kindCn":"增强","zh":"现在会激发所有宝珠两次","en":"now Evokes all of your Orbs twice"}]},"tesla-coil":{"cn":"特斯拉线圈","char":"defect","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"change","kindCn":"调整","zh":"伤害从 6 降至 4，但闪电触发次数从 1 次提升至 2 次","en":"damage decreased from 6 -> 4, but Lightning triggers increased from once -> twice"},{"ver":"0.105.0","date":"2026-05-08","kind":"buff","kindCn":"增强","zh":"伤害从 6 降至 4，但闪电触发次数从 1 次提升至 2 次","en":"damage decreased from 6 -> 4, but Lightning Triggers increased from once -> twice"}]},"uproar":{"cn":"骚动","char":"defect","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"伤害从 5(7) 提升至 6(8)","en":"damage increased from 5(7) -> 6(8)"},{"ver":"0.105.0","date":"2026-05-08","kind":"buff","kindCn":"增强","zh":"伤害从 5(7) 提升至 6(8)","en":"damage increased from 5(7) -> 6(8)"}]},"gold-axe":{"cn":"金斧","char":"colorless","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"多人模式下，现在按所有玩家打出的牌数计算伤害，而非仅统计持有者","en":"in multiplayer, now deals damage equal to the number of cards played by ALL players, not just its owner"},{"ver":"0.105.0","date":"2026-05-08","kind":"buff","kindCn":"增强","zh":"多人模式下，现在按所有玩家打出的牌数计算伤害，而非仅统计持有者打出的牌","en":"in multiplayer, now deals damage equal to the number of cards played by ALL players, not just cards played by its owner"}]},"howl-from-beyond":{"cn":"彼岸咆哮","char":"ironclad","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"buff","kindCn":"增强","zh":"伤害从 16(21) 提升至 18(24)","en":"Damage increased from 16(21) → 18(24)"},{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"触发时机从回合开始时改为回合结束时","en":"trigger moved from start of turn -> end of turn"},{"ver":"0.106.0","date":"2026-05-22","kind":"buff","kindCn":"增强","zh":"触发时机从回合开始时改为回合结束时","en":"trigger moved from start of turn -> end of turn"}]},"entrench":{"cn":"巩固","char":"ironclad","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"现在可以从灵巧等附魔中获得额外格挡","en":"can now gain extra Block from enchantments like Nimble"},{"ver":"0.106.0","date":"2026-05-22","kind":"buff","kindCn":"增强","zh":"现在可以从灵巧等附魔中获得额外格挡","en":"can now gain extra Block from enchantments like Nimble"}]},"unrelenting":{"cn":"无情猛攻","char":"ironclad","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"伤害从 12(18) 提升至 14(20)","en":"damage increased from 12(18) -> 14(20)"},{"ver":"0.106.0","date":"2026-05-22","kind":"buff","kindCn":"增强","zh":"伤害从 12(18) 提升至 14(20)","en":"damage increased from 12(18) -> 14(20)"}]},"predator":{"cn":"猎杀者","char":"silent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"change","kindCn":"调整","zh":"稀有度从罕见降为普通","en":"rarity decreased from Uncommon -> Common"},{"ver":"0.106.0","date":"2026-05-22","kind":"change","kindCn":"调整","zh":"稀有度从罕见降为普通","en":"rarity decreased from Uncommon -> Common"}]},"pounce":{"cn":"猛扑","char":"silent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"伤害从 12(18) 提升至 14(20)","en":"damage increased from 12(18) -> 14(20)"},{"ver":"0.106.0","date":"2026-05-22","kind":"buff","kindCn":"增强","zh":"伤害从 12(18) 提升至 14(20)","en":"damage increased from 12(18) -> 14(20)"}]},"furnace":{"cn":"熔炉","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"锻造值从 4(6) 提升至 5(7)","en":"Forge increased from 4(6) -> 5(7)"},{"ver":"0.106.0","date":"2026-05-22","kind":"buff","kindCn":"增强","zh":"锻造值从 4(6) 提升至 5(7)","en":"Forge increased from 4(6) -> 5(7)"}]},"minion-sacrifice":{"cn":"仆从捐躯","char":"derivative","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"nerf","kindCn":"削弱","zh":"格挡从 9(12) 降至 8(11)","en":"Block decreased from 9(12) -> 8(11)"},{"ver":"0.106.0","date":"2026-05-22","kind":"nerf","kindCn":"削弱","zh":"格挡从 9(12) 降至 8(11)","en":"Block decreased from 9(12) -> 8(11)"}]},"the-sealed-throne":{"cn":"封印王座","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"change","kindCn":"调整","zh":"升级效果从获得固有改为能量消耗 -1","en":"upgrade changed from Innate -> lowering Energy cost by 1"},{"ver":"0.106.0","date":"2026-05-22","kind":"change","kindCn":"调整","zh":"升级效果从获得固有改为能量消耗 -1","en":"upgrade changed from Innate -> lowering Energy cost by 1"}]},"astral-pulse":{"cn":"星界脉冲","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"change","kindCn":"调整","zh":"伤害从 14(18) 改为 6(8)×2","en":"changed damage from 14(18) -> 6(8)x2"},{"ver":"0.106.0","date":"2026-05-22","kind":"change","kindCn":"调整","zh":"伤害从 14(18) 改为 6×2(8×2)","en":"damage changed from 14(18) -> 6x2(8x2)"}]},"death-march":{"cn":"死亡行军","char":"necrobinder","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"额外伤害从 3(4) 提升至 4(6)","en":"additional damage increased from 3(4) -> 4(6)"},{"ver":"0.106.0","date":"2026-05-22","kind":"buff","kindCn":"增强","zh":"额外伤害从 3(4) 提升至 4(6)","en":"additional damage increased from 3(4) -> 4(6)"}]},"fusion":{"cn":"聚变","char":"defect","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"change","kindCn":"调整","zh":"能量消耗从 2(1) 降至 1；现在具有耗尽，升级后移除耗尽","en":"Energy cost decreased from 2(1) -> 1; now Exhausts, and loses Exhaust on upgrade"},{"ver":"0.106.0","date":"2026-05-22","kind":"change","kindCn":"调整","zh":"能量消耗从 2(1) 降至 1；现在具有耗尽，升级后移除耗尽","en":"Energy cost decreased from 2(1) -> 1 Now Exhausts, and loses Exhaust on upgrade"}]},"synthesis":{"cn":"人工合成","char":"defect","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"伤害从 12(18) 提升至 14(20)","en":"damage increased from 12(18) -> 14(20)"},{"ver":"0.106.0","date":"2026-05-22","kind":"buff","kindCn":"增强","zh":"伤害从 12(18) 提升至 14(20)","en":"damage increased from 12(18) -> 14(20)"}]},"fasten":{"cn":"勒紧","char":"colorless","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"nerf","kindCn":"削弱","zh":"额外格挡从 5(7) 降至 4(6)","en":"additional Block decreased from 5(7) -> 4(6)"},{"ver":"0.106.0","date":"2026-05-22","kind":"nerf","kindCn":"削弱","zh":"额外格挡从 5(7) 降至 4(6)","en":"additional Block decreased from 5(7) -> 4(6)"}]},"juggernaut":{"cn":"势不可当","char":"ironclad","list":[{"ver":"0.107.0","date":"2026-06-04","kind":"buff","kindCn":"增强","zh":"伤害从 5(7) 提升至 6(8)","en":"damage increased from 5(7) -> 6(8)"}]},"monarchs-gaze":{"cn":"王之凝视","char":"regent","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"能量消耗从 3(2) 降至 2(1)","en":"Energy cost decreased from 3(2) -> 2(1)"},{"ver":"0.107.0","date":"2026-06-04","kind":"buff","kindCn":"增强","zh":"能量消耗从 3(2) 降至 2(1)","en":"Energy cost decreased from 3(2) -> 2(1)"}]},"sic-em":{"cn":"紧追不放","char":"necrobinder","list":[{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"召唤数从 2(3) 提升至 3(4)","en":"Summon increased from 2(3) -> 3(4)"},{"ver":"0.107.0","date":"2026-06-04","kind":"buff","kindCn":"增强","zh":"召唤数从 2(3) 提升至 3(4)","en":"Summon increased from 2(3) -> 3(4)"}]},"the-scythe":{"cn":"巨镰","char":"necrobinder","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"伤害成长值从 4(5) 提升至 5(7)","en":"damage scaling increased from 4(5) -> 5(7)"},{"ver":"0.107.1","date":"2026-06-19","kind":"buff","kindCn":"增强","zh":"伤害从 3(4) 提升至 4(5)","en":"damage increased from 3(4) -> 4(5)"},{"ver":"0.107.0","date":"2026-06-04","kind":"buff","kindCn":"增强","zh":"伤害从 3(4) 提升至 4(5)","en":"damage increased from 3(4) -> 4(5)"}]},"crimson-mantle":{"cn":"绯红披风","char":"ironclad","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"nerf","kindCn":"削弱","zh":"格挡从 8(10) 降至 7(10)","en":"Block gain decreased from 8(10) → 7(10)"}]},"setup-strike":{"cn":"预备打击","char":"ironclad","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"buff","kindCn":"增强","zh":"力量获得从 2(3) 提升至 3(4)","en":"Strength gain increased from 2(3) → 3(4)"}]},"outbreak":{"cn":"毒性爆发","char":"silent","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"rework","kindCn":"重做","zh":"「每施加 3 次中毒，对所有敌人造成 15 点伤害。」改为「每当你施加中毒，对所有敌人造成 3(4) 点伤害。」","en":"\"Every 3 times you apply Poison, deal 15 damage to ALL enemies.\" → \"Whenever you apply Poison, deal 3(4) damage to ALL enemies.\""}]},"tracking":{"cn":"跟踪","char":"silent","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"nerf","kindCn":"削弱","zh":"「虚弱状态的敌人受到攻击牌的伤害翻倍。」改为「虚弱状态的敌人受到攻击牌的伤害提高 50%。」","en":"\"Weak enemies take double damage from Attacks.\" → \"Weak enemies take 50% more damage from Attacks.\""}]},"devastate":{"cn":"葬送","char":"regent","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"buff","kindCn":"增强","zh":"伤害从 30(40) 提升至 35(45)","en":"damage increased from 30(40) → 35(45)"}]},"resonance":{"cn":"共鸣","char":"regent","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"buff","kindCn":"增强","zh":"星辰消耗从 3 降至 2","en":"Star cost decreased from 3 → 2"}]},"haunt":{"cn":"纠缠","char":"necrobinder","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"buff","kindCn":"增强","zh":"生命值损失从 6(8) 提升至 7(9)","en":"HP loss increased from 6(8) → 7(9)"}]},"reave":{"cn":"剥夺","char":"necrobinder","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"buff","kindCn":"增强","zh":"伤害从 9(11) 提升至 10(13)","en":"damage increased from 9(11) → 10(13)"}]},"soul-storm":{"cn":"灵魂风暴","char":"necrobinder","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"buff","kindCn":"增强","zh":"额外伤害从 2(3) 提升至 4(6)","en":"additional damage increased from 2(3) → 4(6)"}]},"momentum-strike":{"cn":"趁势打击","char":"defect","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"buff","kindCn":"增强","zh":"伤害从 10(13) 提升至 11(15)","en":"damage from 10(13) → 11(15)"}]},"scrape":{"cn":"刮削","char":"defect","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"change","kindCn":"调整","zh":"不再弃置那些因全局临时效果而暂时降为 0 消耗的牌（例如「猛扑」的「下一张技能牌消耗 0 点能量」效果）","en":"no longer discards cards whose energy costs are temporarily set to 0 by global temporary effects (ex. Pounce card's \"The next Skill you play is costs 0 Energy\" effect)"}]},"flanking":{"cn":"夹击","char":"silent","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"change","kindCn":"调整","zh":"稀有度从罕见升为稀有","en":"rarity increased from Uncommon → Rare"}]},"legion-of-bone":{"cn":"骸骨军团","char":"necrobinder","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"change","kindCn":"调整","zh":"不再 耗尽","en":"no longer Exhausts"}]},"ignition":{"cn":"引火","char":"defect","list":[{"ver":"0.108.0","date":"2026-07-03","kind":"change","kindCn":"调整","zh":"稀有度从稀有降为罕见","en":"rarity decreased from Rare → Uncommon"}]},"demon-form":{"cn":"恶魔形态","char":"ironclad","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"buff","kindCn":"增强","zh":"力量获得从 2(3) 提升至 3(4)","en":"Strength gain increased from 2(3) -> 3(4)"}]},"primal-force":{"cn":"原始力量","char":"ironclad","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"buff","kindCn":"增强","zh":"巨石衍生物的伤害从 16(20) 提升至 20(24)","en":"Giant Rock token damage increased from 16(20) -> 20(24)"}]},"taunt":{"cn":"挑衅","char":"ironclad","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"change","kindCn":"调整","zh":"格挡获得从 7(8) 降至 6(7)；稀有度从罕见降为普通","en":"Block gain decreased from 7(8) -> 6(7) Rarity decreased from Uncommon -> Common"}]},"bloodletting":{"cn":"放血","char":"ironclad","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"change","kindCn":"调整","zh":"稀有度从普通升为罕见","en":"rarity increased from Common -> Uncommon"}]},"cruelty":{"cn":"残酷","char":"ironclad","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"change","kindCn":"调整","zh":"稀有度从稀有降为罕见","en":"rarity decreased from Rare -> Uncommon"}]},"mirage":{"cn":"蜃景","char":"silent","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"nerf","kindCn":"削弱","zh":"现在具有耗尽、升级后移除耗尽，取代原先消耗从 1 降为 0 的效果","en":"now Exhausts and loses Exhaust on upgrade instead of cost lowering from 1 → 0"},{"ver":"0.110.0","date":"2026-07-31","kind":"change","kindCn":"调整","zh":"回退为之前的版本（即重新改为按敌人中毒层数获得格挡）；不再具有耗尽","en":"Reverted back to its previous version (i.e. gains Block based on enemy Poison again) No longer Exhausts"},{"ver":"0.109.0","date":"2026-07-17","kind":"rework","kindCn":"重做","zh":"罕见 - 技能牌 - 消耗 1(0) -「获得等同于所有敌人中毒层数的格挡。耗尽。」改为 罕见 - 技能牌 - 消耗 0 -「下一回合，获得 1(2) 点能量。」","en":"Uncommon - Skill - 1(0) - \"Gain Block equal to Poison on ALL enemies. Exhaust.\" -> Uncommon - Skill - 0 - \"Next turn, gain 1(2) Energy.\""}]},"well-laid-plans":{"cn":"计划妥当","char":"silent","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"nerf","kindCn":"削弱","zh":"消耗从 1(0) 提升至 2(1)","en":"cost increased from 1(0) -> 2(1)"},{"ver":"0.109.0","date":"2026-07-17","kind":"rework","kindCn":"重做","zh":"罕见 - 能力牌 - 消耗 1 -「回合结束时，保留最多 1(2) 张牌。」改为 稀有 - 能力牌 - 消耗 1(0) -「回合结束时，你不再弃置手牌。」现在多人模式也可用（此前仅限单人）","en":"Uncommon - Power - Cost 1 - \"At the end of your turn, Retain up to 1(2) card(s).\" -> Rare - Power - Cost 1(0) - \"At the end of your turn, you no longer discard your Hand.\" Now also available in multiplayer, was previously singleplayer-only"}]},"expertise":{"cn":"独门技术","char":"silent","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"rework","kindCn":"重做","zh":"「抽牌直至手牌有 6(7) 张。」改为「抽 2(3) 张牌。这些牌本回合获得保留。」另外强化「爆发」：伤害从 3(4) 提升至 4(5)","en":"\"Draw cards until you have 6(7) in your hand.\" -> \"Draw 2(3) cards. They gain Retain this turn.\" Buffed: Outbreak card: damage increased from 3(4) -> 4(5)"}]},"accelerant":{"cn":"触媒","char":"silent","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"change","kindCn":"调整","zh":"稀有度从稀有降为罕见","en":"rarity decreased from Rare -> Uncommon"}]},"pillar-of-creation":{"cn":"创世之柱","char":"regent","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"change","kindCn":"调整","zh":"回退为之前的版本（即效果不再每回合只触发一次）；格挡从 3(4) 降至 2(3)","en":"Reverted back to its previous version (i.e. effect is no longer triggered just once per turn) Block decreased from 3(4) -> 2(3)"},{"ver":"0.109.0","date":"2026-07-17","kind":"rework","kindCn":"重做","zh":"「每当你生成一张牌，获得 3 点格挡。」改为「每回合首次生成牌时，获得 5(7) 点格挡。」","en":"\"Whenever you create a card, gain 3 Block.\" -> \"The first time you create a card each turn, gain 5(7) Block.\""}]},"eidolon":{"cn":"幻景","char":"necrobinder","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"change","kindCn":"调整","zh":"无法再在战斗中生成","en":"can no longer be generated mid-combat"},{"ver":"0.109.0","date":"2026-07-17","kind":"rework","kindCn":"重做","zh":"「耗尽你的手牌。若以此法耗尽了 9 张牌，获得 1 层无形。」改为「打出消耗堆中所有虚无牌。耗尽。」","en":"\"Exhaust your Hand. If 9 cards were Exhausted this way, gain 1 Intangible.\" -> \"Play ALL Ethereal cards in your Exhaust Pile. Exhaust.\""}]},"sunder":{"cn":"分离","char":"defect","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"buff","kindCn":"增强","zh":"伤害从 24(32) 提升至 26(34)","en":"damage increased from 24(32) -> 26(34)"}]},"trash-to-treasure":{"cn":"化废为宝","char":"defect","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"change","kindCn":"调整","zh":"升级效果从获得固有改为消耗 -1","en":"upgrade changed from gains Innate -> lowers cost by 1"}]},"midnight":{"cn":"午夜","char":"ironclad","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"nerf","kindCn":"削弱","zh":"伤害从 99(120) 降至 60(72)","en":"damage decreased from 99(120) -> 60(72)"}]},"the-ball":{"cn":"魔球","char":"colorless","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"nerf","kindCn":"削弱","zh":"成长值从 +15(25) 降至 +10(15)","en":"scaling decreased from +15(25) -> +10(15)"}]},"blade-symphony":{"cn":"刀刃交响曲","char":"silent","list":[{"ver":"0.109.0","date":"2026-07-17","kind":"nerf","kindCn":"削弱","zh":"消耗从 1 提升至 2(1)；升级不再增加飞刀数量","en":"Cost increased from 1 -> 2(1) Upgrade no longer increases Shiv count"}]},"abundance":{"cn":"富足","char":"event","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"现在总是生成已升级的能力牌；升级效果改为能量消耗 -1","en":"Now always creates Upgraded powers Upgrade changed to lower Energy cost by 1"}]},"relax":{"cn":"放松","char":"event","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"格挡从 15(17) 提升至 16(18)","en":"Block increased from 15(17) → 16(18)"}]},"whistle":{"cn":"吹哨","char":"event","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"消耗从 3 降至 2","en":"cost decreased from 3 -> 2"}]},"maul":{"cn":"撕咬","char":"event","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"猛袭伤害的成长值从 1(2) 提升至 2(3)","en":"Maul damage scaling increased from 1(2) -> 2(3)"}]},"mangle":{"cn":"凌虐","char":"ironclad","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"伤害从 15(20) 提升至 20(26)","en":"damage increased from 15(20) -> 20(26)"}]},"pacts-end":{"cn":"契约终结","char":"ironclad","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"伤害从 17(23) 提升至 18(24)","en":"damage increased from 17(23) -> 18(24)"}]},"haze":{"cn":"迷雾","char":"silent","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"rework","kindCn":"重做","zh":"罕见 - 技能牌 - 消耗 3 -「狡诈。对所有敌人施加 4(6) 层中毒。」改为 罕见 - 技能牌 - 消耗 2 -「对所有敌人施加 4(6) 层中毒和 1(2) 层虚弱。」","en":"Uncommon - Skill - Cost 3 - \"Sly. Apply 4(6) Poison to ALL enemies.\" -> Uncommon - Skill - Cost 2 - \"Apply 4(6) Poison and 1(2) Weak to ALL enemies.\""}]},"echoing-slash":{"cn":"回响斩击","char":"silent","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"change","kindCn":"调整","zh":"稀有度从稀有降为罕见","en":"rarity decreased from Rare -> Uncommon"}]},"terraforming":{"cn":"地形改造","char":"regent","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"活力从 6(8) 提升至 7(10)","en":"Vigor increased from 6(8) → 7(10)"}]},"crush-under":{"cn":"下砸","char":"regent","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"伤害从 7(8) 提升至 8(9)","en":"damage increased from 7(8) -> 8(9)"}]},"sacrifice":{"cn":"牺牲","char":"necrobinder","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"格挡从仆从最大生命值的 2 倍提升至 3 倍","en":"Block gain increased from double -> triple Osty's Max HP"}]},"biased-cognition":{"cn":"偏差认知","char":"defect","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"专注从 4(5) 提升至 5(6)","en":"Focus increased from 4(5) → 5(6)"}]},"refract":{"cn":"折射","char":"defect","list":[{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"伤害从 9(12) 提升至 10(13)","en":"damage increased from 9(12) -> 10(13)"}]},"synchronize":{"cn":"同步","char":"defect","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"nerf","kindCn":"削弱","zh":"专注从 2(3) 降至 1(2)","en":"Focus decreased from 2(3) → 1(2)"},{"ver":"0.110.0","date":"2026-07-31","kind":"buff","kindCn":"增强","zh":"升级效果改为临时专注从 2 提升至 3；不再具有耗尽","en":"Upgrade changed to increase temp focus from 2 -> 3 No longer Exhausts"}]},"brightest-flame":{"cn":"至亮之焰","char":"event","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"nerf","kindCn":"削弱","zh":"max 生命值损失从 1 提升至 2","en":"max HP loss increased from 1 → 2"}]},"rend":{"cn":"撕碎","char":"colorless","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"change","kindCn":"调整","zh":"能量消耗从 2 降至 1基础伤害从 15(18) 降至 10(12)","en":"Energy cost decreased from 2 → 1 Base damage decreased from 15(18) → 10(12)"}]},"salvo":{"cn":"箭雨","char":"colorless","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"change","kindCn":"调整","zh":"与「飞溅」交换稀有度：飞溅现为稀有，齐射现为罕见","en":"swapped rarities, Splash is now Rare and Salvo is now Uncommon"}]},"splash":{"cn":"飞溅","char":"colorless","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"change","kindCn":"调整","zh":"与「齐射」交换稀有度：飞溅现为稀有，齐射现为罕见","en":"swapped rarities, Splash is now Rare and Salvo is now Uncommon"}]},"rampage":{"cn":"暴走","char":"ironclad","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"buff","kindCn":"增强","zh":"基础伤害从 9 提升至 10成长伤害从 5(9) 提升至 5(10)","en":"Base damage increased from 9 → 10 Scaling damage from 5(9) → 5(10)"}]},"shroud":{"cn":"厄运之衣","char":"necrobinder","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"buff","kindCn":"增强","zh":"格挡从 2(3) 提升至 3(4)","en":"Block gain increased from 2(3) → 3(4)"}]},"times-up":{"cn":"大限已至","char":"necrobinder","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"buff","kindCn":"增强","zh":"不再 has 耗尽","en":"no longer has Exhaust"}]},"thunder":{"cn":"雷霆","char":"defect","list":[{"ver":"0.111.0","date":"2026-08-14","kind":"buff","kindCn":"增强","zh":"伤害从 6(8) 提升至 8(11)","en":"Damage from 6(8) → 8(11)"}]}}};
const HIST_STS1 = {"meta":{"game":"sts1","source":"Steam 官方补丁说明 (Slay the Spire, appid 646570)","versions":["1.1","2.0","2.2","WP1","WP10","WP12","WP16","WP17","WP18","WP19","WP20","WP21","WP23","WP24","WP25","WP28","WP29","WP3","WP30","WP33","WP34","WP36","WP37","WP39","WP4","WP40","WP44","WP46","WP47","WP49","WP5","WP50","WP51","WP55","WP56","WP6","WP7","WP9"],"updated":"2026-09-09","count":110,"changes":184},"cards":{"AccuracyG":{"cn":"精准","list":[{"ver":"WP51","date":"2018-12-07","kind":"change","kindCn":"调整","zh":"现在能正确作用于由「混乱」「浩劫」等卡从牌堆顶打出的飞刀","en":"now correctly works with Shivs played from the top of the deck via cards like Mayhem or Havoc."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 3 提升至 4","en":"buffed. Damage increased from 3 -> 4."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 5 提升至 6","en":"buffed. Damage increased from 5 -> 6."}]},"AggregateB":{"cn":"汇集","list":[{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"充能间隔从每 6 张牌缩短为每 4 张牌（更频繁获得能量）","en":"buffed. Energy gained every 6 -> 4 cards."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"充能间隔从每 5 张牌缩短为每 3 张牌（更频繁获得能量）","en":"buffed. Energy gained every 5 -> 3 cards."}]},"BladeDanceG":{"cn":"刀刃之舞","list":[{"ver":"WP36","date":"2018-08-03","kind":"nerf","kindCn":"削弱","zh":"稀有度从罕见下调为普通","en":"rarity lowered from Uncommon -> Common."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"飞刀数量从 2 提升至 3","en":"buffed. 2 -> 3 shivs."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"飞刀数量从 3 提升至 4","en":"buffed. 3 -> 4 shivs."}]},"BloodlettingR":{"cn":"放血","list":[{"ver":"WP4","date":"2017-12-15","kind":"buff","kindCn":"增强","zh":"整体改动","en":"buffed."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"获得能量从 1 提升至 2","en":"buffed. Energy gain increased from 1 -> 2."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"获得能量从 2 提升至 3","en":"buffed. Energy gain increased from 2 -> 3."}]},"DramaticEntrance":{"cn":"闪亮登场","list":[{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 6 提升至 8","en":"buffed. Damage increased from 6 -> 8."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 8 提升至 12","en":"buffed. Damage increased from 8 -> 12."}]},"EviscerateG":{"cn":"内脏切除","list":[{"ver":"WP25","date":"2018-05-17","kind":"change","kindCn":"调整","zh":"现在被「停滞」能力退回时消耗正确","en":"now has correct cost when returned from Stasis power."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 6 提升至 7","en":"buffed. Damage increased from 6 -> 7."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 8 提升至 9","en":"buffed. Damage increased from 8 -> 9."}]},"GoodInstincts":{"cn":"优秀直觉","list":[{"ver":"WP46","date":"2018-10-19","kind":"buff","kindCn":"增强","zh":"格挡从 4 提升至 5（+ 升级版从 7 提升至 8）","en":"buff: 4 -> 5 Block. Good Instincts+: 7 -> 8 Block."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"格挡从 5 提升至 6","en":"buffed. Block increased from 5 -> 6."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"格挡从 8 提升至 9","en":"buffed. Block increased from 8 -> 9."}]},"HemokinesisR":{"cn":"御血术","list":[{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 14 提升至 15","en":"buffed. Damage increased from 14 -> 15."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"生命值损失从 3 降至 2","en":"buffed. HP loss decreased from 3 -> 2."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 18 提升至 20","en":"buffed. Damage increased from 18 -> 20."}]},"PhantasmalKillerG":{"cn":"幻影杀手","list":[{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"消耗从 2 降至 1","en":"buffed. Cost reduced from 2 -> 1."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"消耗从 1 降至 0","en":"buffed. Cost reduced from 1 -> 0."}]},"ReflexG":{"cn":"本能反应","list":[{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"抽牌数从 1 提升至 2","en":"buffed. Card draw increased from 1 -> 2."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"抽牌数从 2 提升至 3","en":"buffed. Card draw increased from 2 -> 3."}]},"ReprogramB":{"cn":"重编程","list":[{"ver":"2.2","date":"2020-11-30","kind":"nerf","kindCn":"削弱","zh":"专注损失从 2 降至 1","en":"Focus loss decreased from 2 -> 1."},{"ver":"2.2","date":"2020-11-30","kind":"change","kindCn":"调整","zh":"专注损失, 力量, and 敏捷 改为从 1 提升至 2","en":"changed. Focus loss, Strength, and Dexterity changed from 1 -> 2."},{"ver":"2.0","date":"2020-01-14","kind":"rework","kindCn":"重做","zh":"整体改动","en":"reworked."}]},"RuptureR":{"cn":"撕裂","list":[{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"力量获得从 1 提升至 2","en":"buffed. Strength gain increased from 1 -> 2."},{"ver":"2.2","date":"2020-11-30","kind":"nerf","kindCn":"削弱","zh":"能量消耗从 0 提升至 1","en":"nerfed. Energy cost 0 -> 1."}]},"SadisticNature":{"cn":"残虐天性","list":[{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 3 提升至 5","en":"buffed. Damage increased from 3 -> 5."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 4 提升至 7","en":"buffed. Damage increased from 4 -> 7."}]},"ScrapeB":{"cn":"刮削","list":[{"ver":"WP37","date":"2018-08-10","kind":"change","kindCn":"调整","zh":"与「孤注一掷」等卡现在能正确作用于那些在使用前将消耗设为 0 的卡","en":"and All For One cards now correctly work with cards that set cost to 0 until played."},{"ver":"WP23","date":"2018-05-04","kind":"change","kindCn":"调整","zh":"优化了描述文字","en":"wording improvements."},{"ver":"2.2","date":"2020-11-30","kind":"change","kindCn":"调整","zh":"抽牌数从 3 张提升至 4 张","en":"draws 3 -> 4 cards."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 9 提升至 10","en":"buffed. Damage increased from 9 -> 10."},{"ver":"2.2","date":"2020-11-30","kind":"change","kindCn":"调整","zh":"抽牌数从 4 张提升至 5 张","en":"draws 4 -> 5 cards."}]},"SliceG":{"cn":"切割","list":[{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 5 提升至 6","en":"buffed. Damage increased from 5 -> 6."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 8 提升至 9","en":"buffed. Damage increased from 8 -> 9."}]},"SneakyStrikeG":{"cn":"隐秘打击","list":[{"ver":"WP21","date":"2018-04-20","kind":"buff","kindCn":"增强","zh":"伤害从 8 提升至 10（+ 升级版从 12 提升至 14）","en":"buff. 8 -> 10 damage. Upgraded: 12 -> 14 damage."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 10 提升至 12","en":"buffed. Damage increased from 10 -> 12."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 14 提升至 16","en":"buffed. Damage increased from 14 -> 16."}]},"StormofSteelG":{"cn":"钢铁风暴","list":[{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"消耗从 2 降至 1","en":"buffed. Cost lowered from 2 -> 1."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"消耗从 2 降至 1","en":"buffed. Cost lowered from 2 -> 1."}]},"SwiftStrike":{"cn":"迅捷打击","list":[{"ver":"WP46","date":"2018-10-19","kind":"buff","kindCn":"增强","zh":"伤害从 5 提升至 6（+ 升级版从 8 提升至 9）","en":"buff: 5 -. 6 damage. Swift Strike+ buff: 8 -> 9 damage."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 6 提升至 7","en":"buffed. Damage increased from 6 -> 7."},{"ver":"2.2","date":"2020-11-30","kind":"buff","kindCn":"增强","zh":"伤害从 9 提升至 10","en":"buffed. Damage increased from 9 -> 10."}]},"WeaveP":{"cn":"迂回","list":[{"ver":"2.0","date":"2020-01-20","kind":"change","kindCn":"调整","zh":"观者角色现已锁定该卡：第二批解锁内容包含一张已弃用的卡。若之前已解锁，开局时会重新解锁；实际上它本就是「外来影响」","en":"is now locked for the Watcher as the second set of unlocks contained a deprecated card. If this was unlocked previously, it will unlock when starting the game. Nope, apparently it's already Foreign Influence."}]},"FireBreathingR":{"cn":"火焰吐息","list":[{"ver":"2.0","date":"2020-01-14","kind":"rework","kindCn":"重做","zh":"整体改动","en":"reworked."}]},"SeverSoulR":{"cn":"断魂斩","list":[{"ver":"2.0","date":"2020-01-14","kind":"buff","kindCn":"增强","zh":"伤害从 20 提升至 22","en":"buffed. Damage increased from 20 -> 22."}]},"WellLaidPlansG":{"cn":"计划妥当","list":[{"ver":"2.0","date":"2020-01-14","kind":"nerf","kindCn":"削弱","zh":"消耗从 0 提升至 1","en":"cost increased from 0 -> 1."},{"ver":"1.1","date":"2019-07-01","kind":"change","kindCn":"调整","zh":"结算速度略微提升","en":"plays slightly faster now."}]},"BloodforBloodR":{"cn":"以血还血","list":[{"ver":"WP18","date":"2018-03-30","kind":"buff","kindCn":"增强","zh":"数值从 16 提升至 18（+ 升级版从 18 提升至 22）","en":"buff. 16 -> 18. Upgraded: 18 -> 22."},{"ver":"2.0","date":"2020-01-14","kind":"buff","kindCn":"增强","zh":"治疗效果从 10% 提升至 20%","en":"healing buffed from 10% -> 20%."},{"ver":"2.0","date":"2020-01-14","kind":"change","kindCn":"调整","zh":"稀有度从罕见改为普通","en":"rarity changed f rom Uncommon -> Common."},{"ver":"1.1","date":"2019-07-01","kind":"buff","kindCn":"增强","zh":"治疗量从 10% 提升至 25%","en":"buffed to heal 10% -> 25%."}]},"PoisonedStabG":{"cn":"带毒刺击","list":[{"ver":"WP34","date":"2018-07-20","kind":"buff","kindCn":"增强","zh":"伤害从 5 提升至 6（+ 升级版从 6 提升至 8）","en":"buff: Damage 5 -> 6. Upgraded: 6 -> 8."},{"ver":"2.0","date":"2020-01-14","kind":"change","kindCn":"调整","zh":"现为静默角色专属卡","en":"is now Silent only."}]},"DropkickR":{"cn":"飞身踢","list":[{"ver":"2.0","date":"2020-01-14","kind":"change","kindCn":"调整","zh":"现在按描述顺序结算其效果","en":"now resolves its actions in order of its description."}]},"HeelHookG":{"cn":"足跟勾","list":[{"ver":"2.0","date":"2020-01-14","kind":"change","kindCn":"调整","zh":"现在按描述顺序结算其效果","en":"now resolves its actions in order of its description."},{"ver":"1.1","date":"2019-07-01","kind":"buff","kindCn":"增强","zh":"伤害数量从 7 提升至 8","en":"buffed. 7 -> 8 damage."}]},"BerserkR":{"cn":"狂暴","list":[{"ver":"WP34","date":"2018-07-20","kind":"buff","kindCn":"增强","zh":"消耗从 1 降至 0；升级现在使自身易伤从 3 点降至 2 点","en":"buff: Cost 1 -> 0. Upgrading now reduces Vulnerable from 3 -> 2."},{"ver":"WP33","date":"2018-07-13","kind":"buff","kindCn":"增强","zh":"对自身的易伤改为 3 层（原为 5 层）","en":"buffed. Applies 3 Vulnerable to self instead of 5."},{"ver":"WP1","date":"2017-11-25","kind":"buff","kindCn":"增强","zh":"整体改动","en":"buffed."},{"ver":"1.1","date":"2019-07-01","kind":"buff","kindCn":"增强","zh":"自身易伤从 3 点降至 2 点","en":"buffed. Self Vulnerable 3 -> 2."}]},"BullseyeB":{"cn":"瞄准靶心","list":[{"ver":"1.1","date":"2019-07-01","kind":"buff","kindCn":"增强","zh":"锁定层数从 1 提升至 2","en":"buffed. Lock-On 1 -> 2."},{"ver":"1.1","date":"2019-07-01","kind":"buff","kindCn":"增强","zh":"伤害从 10 降至 11","en":"buffed. Damage 10 -> 11."}]},"GrandFinaleG":{"cn":"华丽收场","list":[{"ver":"WP46","date":"2018-10-19","kind":"buff","kindCn":"增强","zh":"伤害从 40 提升至 50（+ 升级版从 50 提升至 60）","en":"buff: 40 -> 50 damage. Grand Finale+: 50 -> 60 damage."},{"ver":"WP19","date":"2018-04-06","kind":"buff","kindCn":"增强","zh":"消耗从 1 降至 0","en":"buff. Cost 1 -> 0."},{"ver":"1.1","date":"2019-07-01","kind":"change","kindCn":"调整","zh":"在快速模式中结算速度提升 0.3 秒","en":"is now 0.3s faster in Fast Mode."}]},"OfferingR":{"cn":"祭品","list":[{"ver":"WP37","date":"2018-08-10","kind":"nerf","kindCn":"削弱","zh":"生命值损失从 5 提升至 6","en":"nerf: HP Loss increased from 5 -> 6."},{"ver":"WP34","date":"2018-07-20","kind":"nerf","kindCn":"削弱","zh":"自身伤害从 4 提升至 5","en":"nerf: Self damage increased from 4 -> 5."},{"ver":"WP6","date":"2018-01-04","kind":"change","kindCn":"调整","zh":"小幅改动：生命值损失现为 4；抽牌数升级从 3 提升至 5","en":"gets a minor change. HP Loss is now 4. Card draw upgrades from 3 -> 5."},{"ver":"1.1","date":"2019-07-01","kind":"change","kindCn":"调整","zh":"在快速模式中结算更快","en":"is now faster in Fast Mode."}]},"SeekB":{"cn":"搜寻","list":[{"ver":"WP23","date":"2018-05-04","kind":"change","kindCn":"调整","zh":"辅助文字不再错误地提示可获得一张技能牌","en":"no longer incorrectly says to get a Skill in its helper text."},{"ver":"1.1","date":"2019-07-01","kind":"change","kindCn":"调整","zh":"现在按稀有度与字母顺序整理卡牌","en":"now organizes cards by rarity and alphabetically."}]},"StaticDischargeB":{"cn":"静电释放","list":[{"ver":"1.1","date":"2019-07-01","kind":"change","kindCn":"调整","zh":"现在明确说明在受到未被格挡的攻击伤害时触发","en":"now clarifies that it triggers when you receive unblocked attack damage."}]},"PiercingWailG":{"cn":"尖啸","list":[{"ver":"WP56","date":"2019-01-18","kind":"change","kindCn":"调整","zh":"在快速模式中结算速度提升 1.2 秒","en":"is now 1.2s faster with Fast Mode."}]},"ReaperR":{"cn":"死亡收割","list":[{"ver":"WP55","date":"2019-01-11","kind":"change","kindCn":"调整","zh":"在持有「靴子」遗物时现在能正确治疗","en":"now heals the correct amount if the player has The Boot relic."}]},"TheBomb":{"cn":"炸弹","list":[{"ver":"WP55","date":"2019-01-11","kind":"buff","kindCn":"增强","zh":"伤害从 30 提升至 40","en":"damage buffed from 30 -> 40."},{"ver":"WP46","date":"2018-10-19","kind":"buff","kindCn":"增强","zh":"的增益图标现在能正确以蓝色显示数字","en":"'s buff icon now correctly displays numbers in blue."}]},"Burn":{"cn":"灼伤","list":[{"ver":"WP51","date":"2018-12-07","kind":"change","kindCn":"调整","zh":"不再在回合结束时触发「吞时者」的被动","en":"no longer trigger Time Eater's ability at end of turn."}]},"ReboundB":{"cn":"弹回","list":[{"ver":"WP51","date":"2018-12-07","kind":"change","kindCn":"调整","zh":"不再将「燃烧」置于牌堆顶","en":"no longer puts Burns on top of your deck."},{"ver":"WP34","date":"2018-07-20","kind":"buff","kindCn":"增强","zh":"伤害从 8 提升至 9（+ 升级版从 11 提升至 12）","en":"buff: Damage 8 -> 9. Upgraded 11 -> 12."}]},"Regret":{"cn":"悔恨","list":[{"ver":"WP50","date":"2018-11-16","kind":"change","kindCn":"调整","zh":"优化了描述文字，明确与「破裂」等卡的交互","en":"wording improved to clarify interactions with cards like Rupture."}]},"MindBlast":{"cn":"心灵震慑","list":[{"ver":"WP49","date":"2018-11-09","kind":"change","kindCn":"调整","zh":"现在能正确作用于「受控混乱」模组","en":"now correctly works with Controlled Chaos mod."},{"ver":"WP9","date":"2018-01-25","kind":"change","kindCn":"调整","zh":"现在在卡牌上显示其将造成的伤害数值","en":"now shows you how much damage it will deal on the card itself."}]},"RebootB":{"cn":"重启","list":[{"ver":"WP47","date":"2018-10-25","kind":"change","kindCn":"调整","zh":"「重启」与「深呼吸」卡不再使基于洗牌的遗物触发两次","en":"and Deep Breath cards no longer trigger shuffle-based relics twice."},{"ver":"WP40","date":"2018-08-31","kind":"change","kindCn":"调整","zh":"优化了描述文字","en":"wording update."},{"ver":"WP37","date":"2018-08-10","kind":"nerf","kindCn":"削弱","zh":"数值从 5 降至 4（+ 升级版抽牌数从 7 降至 6）","en":"nerf: 5 -> 4. Reboot+ 7 -> 6 card draw."}]},"FusionB":{"cn":"聚变","list":[{"ver":"WP47","date":"2018-10-25","kind":"change","kindCn":"调整","zh":"对模组开发者更友好","en":"works better for modders now"}]},"DeflectG":{"cn":"偏折","list":[{"ver":"WP46","date":"2018-10-19","kind":"buff","kindCn":"增强","zh":"格挡从 6 提升至 7","en":"buff: 6 -> 7 Block."}]},"HandOfGreed":{"cn":"贪婪之手","list":[{"ver":"WP46","date":"2018-10-19","kind":"buff","kindCn":"增强","zh":"伤害从 15 提升至 20（+ 升级版从 20 提升至 25）","en":"buff: 15 -> 20 damage. Hand of Greed+: 20 -> 25 damage."}]},"Forethought":{"cn":"预谋","list":[{"ver":"WP46","date":"2018-10-19","kind":"change","kindCn":"调整","zh":"优化了描述文字","en":"wording improvements."}]},"Purity":{"cn":"净化","list":[{"ver":"WP46","date":"2018-10-19","kind":"change","kindCn":"调整","zh":"优化了描述文字","en":"wording improvements."}]},"CorruptionR":{"cn":"腐化","list":[{"ver":"WP44","date":"2018-10-04","kind":"change","kindCn":"调整","zh":"与其他降低消耗的卡不再让「嬗变」「萎靡」等 X 费卡显示为消耗 0","en":"and other cost reducing cards no longer make X cost cards like Transmutation and Malaise display cost 0."}]},"DarknessB":{"cn":"漆黑","list":[{"ver":"WP40","date":"2018-08-31","kind":"rework","kindCn":"重做","zh":"重做：现在触发暗影宝珠的被动能力","en":"reworked. Now triggers the passive ability of your Dark Orbs."},{"ver":"WP23","date":"2018-05-04","kind":"rework","kindCn":"重做","zh":"小幅重做","en":"slight rework."}]},"FissionB":{"cn":"裂变","list":[{"ver":"WP39","date":"2018-08-23","kind":"rework","kindCn":"重做","zh":"整体改动","en":"reworked."}]},"MasterfulStabG":{"cn":"精巧刺击","list":[{"ver":"WP39","date":"2018-08-23","kind":"rework","kindCn":"重做","zh":"整体改动","en":"reworked."},{"ver":"WP28","date":"2018-06-07","kind":"buff","kindCn":"增强","zh":"伤害获得小幅提升","en":"gets a minor damage buff."}]},"JAX":{"cn":"J.A.X.","list":[{"ver":"WP39","date":"2018-08-23","kind":"buff","kindCn":"增强","zh":"不再消耗","en":"buffed. No longer exhausts."}]},"Enlightenment":{"cn":"开悟","list":[{"ver":"WP37","date":"2018-08-10","kind":"change","kindCn":"调整","zh":"is now 罕见 (was 稀有)","en":"is now Uncommon (was Rare)."}]},"GlacierB":{"cn":"冰川","list":[{"ver":"WP37","date":"2018-08-10","kind":"nerf","kindCn":"削弱","zh":"格挡从 8 降至 7（+ 升级版从 11 降至 10）","en":"nerf: 8 -> 7 Block. Glacier+ nerf: 11 -> 10 Block."},{"ver":"WP34","date":"2018-07-20","kind":"nerf","kindCn":"削弱","zh":"格挡从 9 降至 8（+ 升级版从 12 降至 11）","en":"nerf: Block 9 -> 8. Upgraded: 12 -> 11."}]},"JuggernautR":{"cn":"势不可当","list":[{"ver":"WP37","date":"2018-08-10","kind":"buff","kindCn":"增强","zh":"升级时的增益层数从 1 提升至 2","en":"buff: Upgrade amount 1 -> 2."},{"ver":"WP34","date":"2018-07-20","kind":"buff","kindCn":"增强","zh":"伤害从 3 提升至 5（+ 升级版从 5 提升至 6）","en":"buff: Damage 3 -> 5. Upgraded 5 -> 6."},{"ver":"WP3","date":"2017-12-08","kind":"nerf","kindCn":"削弱","zh":"削弱","en":"nerf."}]},"LegSweepG":{"cn":"扫腿","list":[{"ver":"WP37","date":"2018-08-10","kind":"nerf","kindCn":"削弱","zh":"格挡从 12 降至 11（+ 升级版从 15 降至 14）","en":"nerf: 12 -> 11 Block. Leg Sweep+ nerf: 15 -> 14 Block."}]},"RitualDagger":{"cn":"仪式匕首","list":[{"ver":"WP37","date":"2018-08-10","kind":"buff","kindCn":"增强","zh":"伤害从 12 提升至 15","en":"buff: 12 -> 15."},{"ver":"WP37","date":"2018-08-10","kind":"buff","kindCn":"增强","zh":"升级时增益量从 1 提升至 2","en":"buff: Upgrade amount 1 -> 2."},{"ver":"WP34","date":"2018-07-20","kind":"buff","kindCn":"增强","zh":"基础伤害 +3","en":"buff. Base damage +3."},{"ver":"WP29","date":"2018-06-15","kind":"change","kindCn":"调整","zh":"获得时现在会标记为已查看","en":"is marked as seen when you obtain it now."}]},"Transmutation":{"cn":"转化","list":[{"ver":"WP37","date":"2018-08-10","kind":"buff","kindCn":"增强","zh":"由「嬗变」获得的卡本回合消耗降至 0","en":"buffed. Cards acquired by Transmutation now cost 0 for the turn."},{"ver":"WP12","date":"2018-02-16","kind":"change","kindCn":"调整","zh":"不再额外给你一张免费卡","en":"no longer gives you a free card."}]},"WraithFormG":{"cn":"幽魂形态","list":[{"ver":"WP37","date":"2018-08-10","kind":"nerf","kindCn":"削弱","zh":"无形层数从 3 降至 2（+ 升级版从 4 降至 3）","en":"nerf: 3 -> 2 Intangible. Wraith Form+ nerf: 4 -> 3 Intangible."}]},"ThunderStrikeB":{"cn":"雷霆打击","list":[{"ver":"WP37","date":"2018-08-10","kind":"change","kindCn":"调整","zh":"不再在没有任何已聚能的闪电时打出单发闪电","en":"no longer shoots a single lightning if you have channeled no Lightning."}]},"LimitBreakR":{"cn":"突破极限","list":[{"ver":"WP36","date":"2018-08-03","kind":"change","kindCn":"调整","zh":"现在也会使负面力量翻倍","en":"now also doubles negative strength."}]},"BallLightningB":{"cn":"球状闪电","list":[{"ver":"WP36","date":"2018-08-03","kind":"nerf","kindCn":"削弱","zh":"升级版伤害从 4 降至 3","en":"nerf: Upgrade damage 4 -> 3."}]},"AngerR":{"cn":"愤怒","list":[{"ver":"WP34","date":"2018-07-20","kind":"buff","kindCn":"增强","zh":"伤害从 5 提升至 6（+ 升级版从 7 提升至 8）","en":"buff: 5 -> 6 damage. Upgraded 7 -> 8 damage."},{"ver":"WP21","date":"2018-04-20","kind":"buff","kindCn":"增强","zh":"伤害提升 1 点","en":"damage buffed by 1."}]},"ExpertiseG":{"cn":"独门技术","list":[{"ver":"WP34","date":"2018-07-20","kind":"nerf","kindCn":"削弱","zh":"保留手牌上限从 8 张降至 7 张","en":"nerf: 8 -> 7 cards in hand."}]},"HyperbeamB":{"cn":"超能光束","list":[{"ver":"WP34","date":"2018-07-20","kind":"buff","kindCn":"增强","zh":"伤害从 25 提升至 26（+ 升级版从 32 提升至 34）","en":"buff: 25 -> 26 damage. Upgraded: 32 -> 34."}]},"MalaiseG":{"cn":"萎靡","list":[{"ver":"WP34","date":"2018-07-20","kind":"change","kindCn":"调整","zh":"is now 稀有 (was 罕见)","en":"is now Rare (was Uncommon)."}]},"RampageR":{"cn":"暴走","list":[{"ver":"WP34","date":"2018-07-20","kind":"buff","kindCn":"增强","zh":"每回合力量增长从 4 提升至 5（升级版不变）","en":"'s ramp increased from 4 -> 5. No change to upgraded version."}]},"TacticianG":{"cn":"战术大师","list":[{"ver":"WP34","date":"2018-07-20","kind":"change","kindCn":"调整","zh":"is now 罕见","en":"is now Uncommon."},{"ver":"WP3","date":"2017-12-08","kind":"buff","kindCn":"增强","zh":"获得增强","en":"buff."}]},"UnloadG":{"cn":"乾坤一掷","list":[{"ver":"WP34","date":"2018-07-20","kind":"buff","kindCn":"增强","zh":"伤害从 12 提升至 14（+ 升级版从 16 提升至 18）","en":"buff: Damage 12 -> 14. Upgraded 16 -> 18."}]},"HavocR":{"cn":"破灭","list":[{"ver":"WP33","date":"2018-07-13","kind":"change","kindCn":"调整","zh":"现在使用随机数选定随机目标（保证读档一致性）","en":"now utilizes RNG to select its random target (save/load consistency)."},{"ver":"WP23","date":"2018-05-04","kind":"change","kindCn":"调整","zh":"描述中「消耗」首字母未大写，已修正","en":"'s description: Exhaust was not capitalized."},{"ver":"WP3","date":"2017-12-08","kind":"change","kindCn":"调整","zh":"现在即使牌组为空也能打出（弃牌堆会洗回牌组）","en":"can now be played even when no cards are in your deck. (Discard will shuffle in)"}]},"Normality":{"cn":"凡庸","list":[{"ver":"WP33","date":"2018-07-13","kind":"change","kindCn":"调整","zh":"提示文字不再使用错误措辞","en":"'s reminder text no longer uses incorrect wording."}]},"Void":{"cn":"虚空","list":[{"ver":"WP30","date":"2018-06-22","kind":"change","kindCn":"调整","zh":"结算速度提升 0.25 秒","en":"now resolves 0.25s faster."},{"ver":"WP18","date":"2018-03-30","kind":"change","kindCn":"调整","zh":"不再使你的能量变为负数","en":"can no longer get you to negative energy."}]},"GlassKnifeG":{"cn":"玻璃刀刃","list":[{"ver":"WP24","date":"2018-05-10","kind":"change","kindCn":"调整","zh":"描述：「玻璃刀刃的伤害」改为「这张卡牌的伤害」","en":"description: \"Glass Knife's damage\" -> \"This card's damage\""},{"ver":"WP3","date":"2017-12-08","kind":"buff","kindCn":"增强","zh":"获得增强","en":"buff."}]},"FinisherG":{"cn":"终结技","list":[{"ver":"WP24","date":"2018-05-10","kind":"change","kindCn":"调整","zh":"描述：「你已打出 2 张攻击牌」改为「已打出 2 张攻击牌」","en":"description:\"You have played 2 Attacks.\" -> \"2 Attacks played.\""}]},"FeelNoPainR":{"cn":"无惧疼痛","list":[{"ver":"WP23","date":"2018-05-04","kind":"nerf","kindCn":"削弱","zh":"升级增益从 +2 改为 +1","en":"nerfed: Upgrade is now +1 rather than +2."},{"ver":"WP21","date":"2018-04-20","kind":"nerf","kindCn":"削弱","zh":"格挡从 4 降至 3（+ 升级版从 6 降至 5）","en":"nerf. 4 -> 3 block. Upgraded: 6 -> 5 Block."}]},"TrueGritR":{"cn":"坚毅","list":[{"ver":"WP23","date":"2018-05-04","kind":"change","kindCn":"调整","zh":"现在随机数种子正确","en":"is now properly seeded."}]},"EchoFormB":{"cn":"回响形态","list":[{"ver":"WP23","date":"2018-05-04","kind":"nerf","kindCn":"削弱","zh":"改为虚无；升级移除虚无但保留 3 点消耗","en":"nerf: Ethereal. Upgrade removes Ethereal but retains 3 cost."}]},"HelloWorldB":{"cn":"你好，世界","list":[{"ver":"WP23","date":"2018-05-04","kind":"change","kindCn":"调整","zh":"is now 罕见","en":"is now Uncommon."}]},"MelterB":{"cn":"熔化","list":[{"ver":"WP23","date":"2018-05-04","kind":"buff","kindCn":"增强","zh":"伤害从 6 提升至 8（+ 升级版从 9 提升至 11）","en":"buffed: Damage 6 -> 8. Melter+: 9 -> 11."}]},"UndoB":{"cn":"均衡","list":[{"ver":"WP23","date":"2018-05-04","kind":"buff","kindCn":"增强","zh":"消耗降低 1 点","en":"gets buffed: Cost reduced by 1."}]},"BlizzardB":{"cn":"暴雪","list":[{"ver":"WP23","date":"2018-05-04","kind":"change","kindCn":"调整","zh":"修正了描述","en":"description fix."}]},"ForceFieldB":{"cn":"力场","list":[{"ver":"WP23","date":"2018-05-04","kind":"change","kindCn":"调整","zh":"原不受能力（脆弱/敏捷）影响，已修正","en":"was unaffected by Powers (Frail/Dex)."}]},"WhiteNoiseB":{"cn":"白噪声","list":[{"ver":"WP23","date":"2018-05-04","kind":"change","kindCn":"调整","zh":"现在随机数种子正确","en":"is now properly seeded."}]},"ImmolateR":{"cn":"燔祭","list":[{"ver":"WP21","date":"2018-04-20","kind":"buff","kindCn":"增强","zh":"现在将「燃烧」加入弃牌堆而非抽牌堆","en":"buff: Adds a Burn to discard pile instead of draw pile."},{"ver":"WP21","date":"2018-04-20","kind":"buff","kindCn":"增强","zh":"伤害从 18 提升至 21","en":"buff: 18 -> 21 damage."},{"ver":"WP21","date":"2018-04-20","kind":"buff","kindCn":"增强","zh":"伤害从 24 提升至 28","en":"buff: 24 -> 28 damage."}]},"RecklessChargeR":{"cn":"无谋冲锋","list":[{"ver":"WP21","date":"2018-04-20","kind":"change","kindCn":"调整","zh":"is now 罕见","en":"is now Uncommon."},{"ver":"WP21","date":"2018-04-20","kind":"nerf","kindCn":"削弱","zh":"伤害 by 1","en":"nerfed damage by 1."}]},"WildStrikeR":{"cn":"狂野打击","list":[{"ver":"WP21","date":"2018-04-20","kind":"change","kindCn":"调整","zh":"is now 普通","en":"is now Common."},{"ver":"WP20","date":"2018-04-13","kind":"change","kindCn":"调整","zh":"is now 罕见","en":"is now Uncommon."}]},"CleaveR":{"cn":"顺劈斩","list":[{"ver":"WP20","date":"2018-04-13","kind":"buff","kindCn":"增强","zh":"伤害从 7 提升至 8（升级版 10 → 11）","en":"damage buff. 7 -> 8 (10 -> 11)."}]},"CombustR":{"cn":"自燃","list":[{"ver":"WP20","date":"2018-04-13","kind":"buff","kindCn":"增强","zh":"伤害从 6 提升至 7","en":"damage buff. 6 -> 7."},{"ver":"WP19","date":"2018-04-06","kind":"buff","kindCn":"增强","zh":"伤害从 4 提升至 5","en":"buff. Damage 4 -> 5."}]},"CarnageR":{"cn":"残杀","list":[{"ver":"WP18","date":"2018-03-30","kind":"buff","kindCn":"增强","zh":"伤害从 18 提升至 20（+ 升级版从 26 提升至 28）","en":"buff: 18 -> 20. Upgraded: 26 -> 28"}]},"DeadlyPoisonG":{"cn":"致命毒药","list":[{"ver":"WP18","date":"2018-03-30","kind":"buff","kindCn":"增强","zh":"中毒层数从 4 提升至 5（+ 升级版从 6 提升至 7）","en":"buff: 4 -> 5. Upgraded: 6 -> 7."}]},"EvolveR":{"cn":"进化","list":[{"ver":"WP18","date":"2018-03-30","kind":"change","kindCn":"调整","zh":"不再产生「伤口」；现在对任意状态牌触发，而非仅「伤口」","en":"No longer gives Wounds. Now triggers on any Status card, not just Wounds."}]},"CurseoftheBell":{"cn":"铃铛的诅咒","list":[{"ver":"WP17","date":"2018-03-22","kind":"change","kindCn":"调整","zh":"新增：升天者的灾祸——不可打出，无法从牌组中移除","en":"- Ascender's Bane: Unplayable. Cannot be removed from your deck."}]},"RageR":{"cn":"狂怒","list":[{"ver":"WP16","date":"2018-03-15","kind":"buff","kindCn":"增强","zh":"获得增强：消耗从 1 降至 0，格挡从 4 降至 3","en":"gets a buff, cost 1 -> 0. Block 4 -> 3."}]},"Bite":{"cn":"噬咬","list":[{"ver":"WP10","date":"2018-02-02","kind":"change","kindCn":"调整","zh":"现为无色卡牌","en":"is now a Colorless card."}]},"ExhumeR":{"cn":"发掘","list":[{"ver":"WP7","date":"2018-01-12","kind":"change","kindCn":"调整","zh":"不再能将「发掘」类卡返回手牌","en":"can no longer return an Exhume card to your hand."}]},"CloakAndDaggerG":{"cn":"斗篷与匕首","list":[{"ver":"WP7","date":"2018-01-12","kind":"change","kindCn":"调整","zh":"在卡牌匹配事件解锁前，「匕首」不再出现，取而代之始终会有一张「中和」","en":"and Dagger no longer appears in the card match event before it is unlocked, instead there is always a copy of Neutralize."}]},"BulletTimeG":{"cn":"子弹时间","list":[{"ver":"WP5","date":"2017-12-21","kind":"change","kindCn":"调整","zh":"现在影响手牌中所有卡，可与「疯狂」配合，且不再对你施加能力","en":"now affects all cards currently in hand, works with Madness, and no longer applies a Power to you."}]},"Panache":{"cn":"神气制胜","list":[{"ver":"WP5","date":"2017-12-21","kind":"nerf","kindCn":"削弱","zh":"削弱：触发所需牌数从 4 张提升至 5 张","en":"gets nerfed (4 card trigger -> 5 card trigger)."}]},"EnvenomG":{"cn":"涂毒","list":[{"ver":"WP5","date":"2017-12-21","kind":"change","kindCn":"调整","zh":"为表述清晰而优化描述","en":"gets a wording update for clarity."}]},"Dazed":{"cn":"晕眩","list":[{"ver":"WP5","date":"2017-12-21","kind":"change","kindCn":"调整","zh":"与「笨拙」现在即使通过「周密计划」保留也会消耗（所有虚无卡均如此）","en":"and Clumsy now exhaust even if retained via Well Laid Plans (all Ethereal cards)."},{"ver":"WP3","date":"2017-12-08","kind":"change","kindCn":"调整","zh":"现为虚无牌（对实际玩法影响不大）","en":"is now Ethereal. Doesn't really impact gameplay."}]},"CalculatedGambleG":{"cn":"计算下注","list":[{"ver":"WP4","date":"2017-12-15","kind":"nerf","kindCn":"削弱","zh":"整体改动","en":"nerfed."}]},"AfterImageG":{"cn":"余像","list":[{"ver":"WP4","date":"2017-12-15","kind":"change","kindCn":"调整","zh":"大图现在正常显示","en":"'s large portrait now renders."},{"ver":"WP3","date":"2017-12-08","kind":"change","kindCn":"调整","zh":"现在通过「医疗包」「蓝烛」打出诅咒/状态牌时也能生效","en":"now works when playing Curse/Status cards via Medical Kit and Blue Candle."}]},"CorpseExplosionG":{"cn":"尸爆术","list":[{"ver":"WP3","date":"2017-12-08","kind":"change","kindCn":"调整","zh":"类型现改为攻击牌","en":"'s type is now Attack."}]},"DaggerSprayG":{"cn":"匕首雨","list":[{"ver":"WP3","date":"2017-12-08","kind":"buff","kindCn":"增强","zh":"获得增强","en":"buff."}]},"DieDieDieG":{"cn":"死吧死吧死吧","list":[{"ver":"WP3","date":"2017-12-08","kind":"buff","kindCn":"增强","zh":"获得增强","en":"buff."}]},"Trip":{"cn":"绊倒","list":[{"ver":"WP3","date":"2017-12-08","kind":"buff","kindCn":"增强","zh":"整体改动","en":"buffed."}]},"BrutalityR":{"cn":"残暴","list":[{"ver":"WP1","date":"2017-11-25","kind":"buff","kindCn":"增强","zh":"整体改动","en":"buffed."}]},"ConcentrateG":{"cn":"全神贯注","list":[{"ver":"WP1","date":"2017-11-25","kind":"rework","kindCn":"重做","zh":"整体改动","en":"reworked."}]},"DualWieldR":{"cn":"双持","list":[{"ver":"WP1","date":"2017-11-25","kind":"rework","kindCn":"重做","zh":"重做并增强","en":"reworked and buffed."}]},"PerfectedStrikeR":{"cn":"完美打击","list":[{"ver":"WP1","date":"2017-11-25","kind":"change","kindCn":"调整","zh":"现在统计标题含「打击」的所有卡牌，如迅捷打击、狂野打击等","en":"Now counts ALL cards with the word Strike in its title. Swift Strike, Wild Strike, etc."}]},"ToolsoftheTradeG":{"cn":"必备工具","list":[{"ver":"WP1","date":"2017-11-25","kind":"nerf","kindCn":"削弱","zh":"削弱：不再为固有","en":"nerf. No longer innate."}]},"Necronomicurse":{"cn":"死灵诅咒","list":[{"ver":"WP1","date":"2017-11-25","kind":"change","kindCn":"调整","zh":"不再出现在移除卡牌界面（因为它无法被移除）","en":"no longer shows up on card removal screens (since it cannot be removed)."}]}}};
   // 卡牌版本历史缓存（按游戏，独立异步加载，失败则静默）
// 应用某款游戏的自定义显示字典（角色/类型/稀有度标签、筛选顺序）——从该游戏 meta 读取
function applyGameMeta(meta){
  if(meta){
    if(meta.chars){ CHAR_CN = Object.assign({}, meta.chars); }
    if(meta.types){ TYPE_CN = Object.assign({}, meta.types); }
    if(meta.rarities){ RARE_CN = Object.assign({}, meta.rarities); }
    if(meta.charOrder){ CHAR_ORDER = meta.charOrder.filter(k=>CHAR_CN[k]); }
    if(meta.typeOrder){ TYPE_ORDER = meta.typeOrder.filter(k=>TYPE_CN[k]); }
    if(meta.rareOrder){ RARE_ORDER = meta.rareOrder.filter(k=>RARE_CN[k]); }
    RARE_RANK = {}; RARE_ORDER.forEach((k,i)=>RARE_RANK[k]=i);
  }
}

const state = {
  q: '',
  chars: new Set(),
  types: new Set(),
  rares: new Set(),
  costs: new Set(),
  starCosts: new Set(), // 辉星花费筛选
  extra: new Set(),     // 预留（已无筛选项）
  ver: 'base',
  sort: 'default',
  density: 'comfort',
  favOnly: false,
};

const CHUNK = 90;
let results = [];

/* ---------------- safe storage ---------------- */
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },
};
const $ = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------- token-aware description renderer ---------------- */
function descHTML(t){
  if(!t) return '<span class="muted">（无描述）</span>';
  let s = esc(t);
  // 能量图标：杀戮尖塔1 用 [R][G][B][P] 表示红/绿/蓝/紫 能量点
  s = s.replace(/\[([RGBP])\]/g, '<b class="orb en-$1" title="能量"></b>');
  s = s.replace(/(\d+)点?能量/g, '<b class="orb en" title="能量">$1</b><i class="unit">能量</i>');
  s = s.replace(/(\d+)辉星/g, '<b class="orb star" title="辉星">$1</b><i class="unit">辉星</i>');
  s = s.replace(/(\d+)点?星辰/g, '<b class="orb star" title="星辰">$1</b><i class="unit">星辰</i>');
  // 亡灵契约师（StS2）的「召唤」机制数字：与辉星同款圆圈，紫色
  if (CUR === 'sts2') s = s.replace(/召唤(\d+)/g, '召唤<b class="orb summon" title="召唤">$1</b>');
  s = s.replace(/(\d+)(点?)伤害/g, '<span class="n dmg">$1</span>$2伤害');
  s = s.replace(/(\d+)(点?)格挡/g, '<span class="n blk">$1</span>$2格挡');
  s = s.replace(/(\d+)(点?)生命/g, '<span class="n hp">$1</span>$2生命');
  s = s.replace(/(\d+)层易伤/g, '<span class="n vuln">$1</span>层易伤');
  s = s.replace(/(\d+)层虚弱/g, '<span class="n weak">$1</span>层虚弱');
  s = s.replace(/(\d+)层覆甲/g, '<span class="n ar">$1</span>层覆甲');
  s = s.replace(/(\d+)点力量/g, '<span class="n str">$1</span>点力量');
  s = s.replace(/(\d+)点敏捷/g, '<span class="n dex">$1</span>点敏捷');
  s = s.replace(/(\d+)(点?)活力/g, '<span class="n vig">$1</span>$2活力');
  s = s.replace(/(\d+)(点?)铸造/g, '<span class="n forge">$1</span>$2铸造');
  // 杀戮尖塔1 补充：获得/给予 N 点某种数值 / 造成N伤害 的宽泛匹配
  s = s.replace(/(\d+)点?生命/g, '<span class="n hp">$1</span>$2生命');
  s = s.replace(/(\d+)点?力量/g, '<span class="n str">$1</span>点力量');
  s = s.replace(/(\d+)点?敏捷/g, '<span class="n dex">$1</span>点敏捷');
  s = s.replace(/(\d+)点?格挡/g, '<span class="n blk">$1</span>点格挡');
  return s.split('\n').filter(l=>l.trim()).map(l=>`<span class="ln">${l.trim()}</span>`).join('');
}

/* ---------------- favorites ---------------- */
const FAV_BASE = 'sts-favs-';            // 收藏按游戏隔离
function favKey(){ return FAV_BASE + CUR; }
function getFavs(){
  try{ return new Set(JSON.parse(store.get(favKey()) || '[]')); }catch(e){ return new Set(); }
}
function setFavs(s){ store.set(favKey(), JSON.stringify([...s])); }
function isFav(slug){ return getFavs().has(slug); }
function toggleFav(slug){
  const s = getFavs();
  s.has(slug) ? s.delete(slug) : s.add(slug);
  setFavs(s);
  return s.has(slug);
}

/* ---------------- theme ---------------- */
(function initTheme(){
  const saved = store.get('sts2-theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
})();
$('#themeBtn').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('sts2-theme', next);
});

/* ---------------- density ---------------- */
(function initDensity(){
  const saved = store.get('sts2-density');
  if (saved === 'compact' || saved === 'comfort') state.density = saved;
  document.body.classList.toggle('density-compact', state.density === 'compact');
  const seg = $('#densitySeg');
  [...seg.children].forEach(b => b.classList.toggle('on', b.dataset.d === state.density));
})();
$('#densitySeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  state.density = b.dataset.d;
  store.set('sts2-density', state.density);
  document.body.classList.toggle('density-compact', state.density === 'compact');
  [...e.currentTarget.children].forEach(x => x.classList.toggle('on', x === b));
});

/* ---------------- filter chips ---------------- */
function countBy(fn){ const m={}; APP.CARDS.forEach(c => { const k=fn(c); m[k]=(m[k]||0)+1; }); return m; }
function mkChip(container, key, label, colorVar, count, group){
  const b = document.createElement('button');
  b.className = 'chip'; b.dataset.k = key;
  b.innerHTML = (colorVar ? `<span class="dot" style="background:${colorVar}"></span>` : '')
              + esc(label) + (count != null ? `<span class="cnt">${count}</span>` : '');
  if (colorVar) b.style.setProperty('--cc', colorVar);
  b.addEventListener('click', () => toggleFilter(group, key, b));
  container.appendChild(b);
}
function toggleFilter(group, key, el){
  const s = state[group];
  s.has(key) ? s.delete(key) : s.add(key);
  el.classList.toggle('on', s.has(key));
  apply();
}
function buildFilters(){
  const cc = countBy(c=>c.char), tc = countBy(c=>c.type), rc = countBy(c=>c.rarity);
  const co = {}; APP.CARDS.forEach(c=>{ const keys=new Set(); if(c.cost!=='') keys.add(c.cost); if(String(c.starCost)==='X') keys.add('X'); keys.forEach(k=>co[k]=(co[k]||0)+1); });
  const costs = Object.keys(co).sort((a,b)=>{
    if(a==='X') return 1; if(b==='X') return -1; return (+a)-(+b);
  });
  const fC = $('#fChar'); fC.innerHTML = '';
  CHAR_ORDER.filter(k=>cc[k]).forEach(k => mkChip(fC, k, CHAR_CN[k], `var(--char-${k})`, cc[k], 'chars'));
  const fT = $('#fType'); fT.innerHTML = '';
  TYPE_ORDER.filter(k=>tc[k]).forEach(k => mkChip(fT, k, TYPE_CN[k], null, tc[k], 'types'));
  const fR = $('#fRare'); fR.innerHTML = '';
  RARE_ORDER.filter(k=>rc[k]).forEach(k => mkChip(fR, k, RARE_CN[k], `var(--r-${k})`, rc[k], 'rares'));
  const fCost = $('#fCost'); fCost.innerHTML = '';
  costs.forEach(k => mkChip(fCost, k, k==='X'?'X 费':(k+' 费'), null, co[k], 'costs'));
  // 辉星花费筛选（Star cost）
  const fStar = $('#fStar'); fStar.innerHTML = '';
  const so = {}; APP.CARDS.forEach(c=>{ const v=c.starCost; if(v!==undefined&&v!==null&&v!=='') so[v]=(so[v]||0)+1; });
  const starCostsArr = Object.keys(so).sort((a,b)=>{ if(a==='X')return 1; if(b==='X')return -1; return (+a)-(+b); });
  starCostsArr.forEach(k => mkChip(fStar, k, k==='X'?'辉星 X':'辉星 '+k, 'var(--star)', so[k], 'starCosts'));
  // "更多" 状态类筛选
  const fMore = $('#fMore'); fMore.innerHTML = '';
  const favCnt = getFavs().size;
  const favBtn = document.createElement('button');
  favBtn.className = 'chip fav toggle'; favBtn.dataset.k = 'fav';
  favBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>收藏 <span class="cnt">${favCnt}</span>`;
  favBtn.addEventListener('click', () => {
    state.favOnly = !state.favOnly;
    favBtn.classList.toggle('on', state.favOnly);
    apply();
  });
  fMore.appendChild(favBtn);
}

/* ---------------- active filter summary ---------------- */
function renderActive(){
  const row = $('#activeRow');
  row.innerHTML = '';
  const addTag = (group, key, label, contSel) => {
    const tag = document.createElement('span');
    tag.className = 'active-tag';
    tag.innerHTML = `<span>${esc(label)}</span><button title="移除">×</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      state[group].delete(key);
      // sync chip（按容器作用域定位，避免能量 X 与辉星 X 的 data-k 冲突）
      const btn = document.querySelector(`${contSel} .chip[data-k="${CSS.escape(key)}"]`);
      if (btn) btn.classList.remove('on');
      apply();
    });
    row.appendChild(tag);
  };
  state.chars.forEach(k => addTag('chars', k, CHAR_CN[k] || k, '#fChar'));
  state.types.forEach(k => addTag('types', k, TYPE_CN[k] || k, '#fType'));
  state.rares.forEach(k => addTag('rares', k, RARE_CN[k] || k, '#fRare'));
  state.costs.forEach(k => addTag('costs', k, k === 'X' ? 'X 费' : k+' 费', '#fCost'));
  state.starCosts.forEach(k => addTag('starCosts', k, k === 'X' ? '辉星 X' : '辉星 '+k, '#fStar'));
  if (state.favOnly){
    const tag = document.createElement('span');
    tag.className = 'active-tag';
    tag.innerHTML = `<span>仅收藏</span><button title="移除">×</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      state.favOnly = false;
      document.querySelector('.chip.fav')?.classList.remove('on');
      apply();
    });
    row.appendChild(tag);
  }
  if (state.q){
    const tag = document.createElement('span');
    tag.className = 'active-tag';
    tag.innerHTML = `<span>关键词「${esc(state.q)}」</span><button title="移除">×</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      state.q = ''; $('#q').value = '';
      $('#searchBox').classList.remove('has-val');
      apply();
    });
    row.appendChild(tag);
  }
  if (row.children.length > 1){
    const clr = document.createElement('button');
    clr.className = 'clear-all';
    clr.textContent = '清除全部';
    clr.onclick = resetAll;
    row.appendChild(clr);
  }
}

/* ---------------- filter & sort ---------------- */
function apply(){
  const q = state.q.trim().toLowerCase();
  const favs = getFavs();
  results = APP.CARDS.filter(c => {
    if (state.favOnly && !favs.has(c.slug)) return false;
    if (state.chars.size && !state.chars.has(c.char)) return false;
    if (state.types.size && !state.types.has(c.type)) return false;
    if (state.rares.size && !state.rares.has(c.rarity)) return false;
    if (state.costs.size){
      const hitCost = state.costs.has(c.cost) || (state.costs.has('X') && String(c.starCost)==='X');
      if (!hitCost) return false;
    }
    if (state.starCosts.size && !state.starCosts.has(String(c.starCost ?? ''))) return false;
    if (q){
      const hay = (c.name + ' ' + c.desc + ' ' + (c.descUp||'') + ' ' + c.slug).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (state.sort === 'cost'){
    results.sort((a,b)=>{
      const f = v => v==='X' ? 99 : +v;
      return f(a.cost) - f(b.cost) || a.name.localeCompare(b.name,'zh');
    });
  } else if (state.sort === 'name'){
    results.sort((a,b)=>a.name.localeCompare(b.name,'zh'));
  } else if (state.sort === 'rarity'){
    results.sort((a,b)=>(RARE_RANK[a.rarity]-RARE_RANK[b.rarity]) || a.name.localeCompare(b.name,'zh'));
  }
  $('#count').innerHTML = `显示 <b>${results.length}</b> / ${APP.CARDS.length} 张卡牌`;
  $('#empty').style.display = results.length ? 'none' : 'flex';
  $('#grid').innerHTML = '';
  state.shown = 0;
  renderActive();
  renderMore();
}

/* ---------------- progressive render ---------------- */
function renderMore(){
  if (state.shown >= results.length) return;
  const frag = document.createDocumentFragment();
  const end = Math.min(state.shown + CHUNK, results.length);
  for (let i = state.shown; i < end; i++){
    const c = results[i];
    const up = state.ver === 'up';
    const cost = up ? (c.costUp ?? c.cost) : c.cost;
    const desc = up ? (c.descUp || c.desc) : c.desc;
    const isFavCard = isFav(c.slug);
    const d = document.createElement('div');
    d.className = 'card';
    d.tabIndex = 0;
    d.dataset.slug = c.slug;
    d.style.setProperty('--cc', `var(--char-${c.char})`);
    d.style.setProperty('--rc', `var(--r-${c.rarity})`);
    d.style.animationDelay = Math.min((i - state.shown) * 8, 260) + 'ms';
    d.innerHTML = `
      <button class="c-fav ${isFavCard?'on':''}" title="${isFavCard?'取消收藏':'收藏'}" aria-label="收藏">${isFavCard?'★':'☆'}</button>
      <div class="c-top">
        ${cost!=='' ? `<div class="c-cost${String(cost)==='X'?' x':''}">${esc(cost)}${(()=>{const v=up?(c.starCostUp??c.starCost):c.starCost;return (v!==undefined&&v!==null&&v!=='')?`<span class="c-star" title="辉星花费 ${esc(String(v))}">${esc(String(v))}</span>`:'';})()}</div>` : '<div class="c-cost none"></div>'}
        <div class="c-name">${esc(c.name)}</div>
      </div>
      <div class="c-badges">
        <span class="badge b-type">${esc(TYPE_CN[c.type]||c.type)}</span>
        <span class="badge b-rare">${esc(RARE_CN[c.rarity]||c.rarity)}</span>
        <span class="badge">${esc(CHAR_CN[c.char]||c.char)}</span>
      </div>
      <div class="c-desc">${descHTML(desc)}</div>`;
    d.addEventListener('click', e => {
      if (e.target.closest('.c-fav')) return;
      openCardBySlug(c.slug);
    });
    d.querySelector('.c-fav').addEventListener('click', e => {
      e.stopPropagation();
      const on = toggleFav(c.slug);
      e.currentTarget.classList.toggle('on', on);
      e.currentTarget.textContent = on ? '★' : '☆';
      e.currentTarget.title = on ? '取消收藏' : '收藏';
      if (state.favOnly) apply();
    });
    d.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openCardBySlug(c.slug); }
    });
    frag.appendChild(d);
  }
  $('#grid').appendChild(frag);
  state.shown = end;
}

/* infinite scroll */
if ('IntersectionObserver' in window){
  new IntersectionObserver(es => {
    if (es[0].isIntersecting) renderMore();
  }, {rootMargin:'600px'}).observe($('#sentinel'));
} else {
  window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY > document.body.offsetHeight - 800) renderMore();
  });
  while (state.shown < 180 && state.shown < APP.CARDS.length) renderMore();
}

/* ---------------- 卡牌版本历史 ----------------
   数据来自官方补丁说明，按 slug 索引；没有改动记录的卡不显示该区块 */
const HIST_KIND = { buff: '增强', nerf: '削弱', rework: '重做', change: '调整', new: '新增' };
async function loadHistory(id){
  if (HIST[id]) return HIST[id];
  // 历史数据已内联到本文件顶部（HIST_STS2 / HIST_STS1）。
  // 原因：部署管线会把根目录 .json/.js 数据文件传成 0 字节，故改为内联，确保线上一定可用。
  const g = id === 'sts2' ? HIST_STS2 : id === 'sts1' ? HIST_STS1 : null;
  HIST[id] = (g && g.cards) ? g : null;   // 无数据则静默降级，不影响图鉴本身
  return HIST[id];
}
function histHTML(c){
  const H = HIST[CUR];
  const item = H && H.cards && H.cards[c.slug];
  if (!item || !item.list || !item.list.length) return '';
  const rows = item.list.map(i => `
      <div class="hist-item">
        <div class="hist-meta">
          <span class="hist-ver">v${esc(i.ver)}</span>
          <span class="hist-date">${esc(i.date)}</span>
          <span class="hist-kind k-${esc(i.kind || 'change')}">${esc(i.kindCn || HIST_KIND[i.kind] || '调整')}</span>
        </div>
        <div class="hist-txt">${esc(i.zh || i.en || '')}</div>
      </div>`).join('');
  return `
      <div class="hist open" id="histBox">
        <button class="hist-hd" type="button" id="histToggle" aria-expanded="true">
          <span class="hist-title">版本历史</span>
          <span class="hist-count">${item.list.length} 次改动</span>
          <span class="hist-arrow">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </span>
        </button>
        <div class="hist-body">${rows}</div>
      </div>`;
}

/* ---------------- modal ---------------- */
function openCardBySlug(slug){
  // ensure card is in current results; if filtered out, clear filters to show it
  let idx = results.findIndex(c => c.slug === slug);
  if (idx < 0){
    const c = APP.CARDS.find(x => x.slug === slug);
    if (!c) return;
    // relax filters? we just open the modal anyway with that card
    APP.CARDS.find(x => x.slug === slug); // noop
    openModal(c, -1);
    return;
  }
  openModal(results[idx], idx);
}
function openModal(c, idx){
  APP.currentIndex = idx;
  const cc = `var(--char-${c.char})`;
  const sheet = $('#sheet');
  sheet.style.setProperty('--cc', cc);
  sheet.style.setProperty('--rc', `var(--r-${c.rarity})`);
  const sameText = !c.descUp || c.descUp === c.desc;
  const sameCost = String(c.costUp) === String(c.cost);
  const artUrl = /^https?:/i.test(c.art||'') ? c.art : (ART_BASE + (c.art||''));
  const fav = isFav(c.slug);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < results.length - 1;
  sheet.innerHTML = `
    <div class="sheet-hd">
      <button class="prev" title="上一张 (←)" ${hasPrev?'':'disabled'}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div style="flex:1;min-width:0">
        <h2>${esc(c.name)}</h2>
        <div class="sub">${esc(CHAR_CN[c.char]||c.char)} · ${esc(TYPE_CN[c.type]||c.type)} · ${esc(RARE_CN[c.rarity]||c.rarity)}</div>
      </div>
      <div class="sheet-actions">
        <button class="fav-btn ${fav?'on':''}" id="modalFav" title="${fav?'取消收藏':'收藏'}">${fav?'★':'☆'}</button>
        <button class="copy-link" id="copyLink" title="复制直链">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
          复制链接
        </button>
        <button class="x-btn icon-btn" onclick="APP.closeModal()" aria-label="关闭" title="关闭 (Esc)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <button class="next" title="下一张 (→)" ${hasNext?'':'disabled'} style="margin-left:-2px">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>
    <div class="sheet-art">
      <div class="art">
        <img loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'立绘暂不可用'}))" src="${artUrl}">
        ${CUR==='sts2'
          ? '<a class="src" href="https://sts2front.com/zh-cn/cards/" target="_blank" rel="noopener">图片来源</a>'
          : '<a class="src" href="https://sts.huijiwiki.com/" target="_blank" rel="noopener">图片来源</a>'}
      </div>
      <div>
        <div class="sheet-tags">
          <span class="badge b-type">${esc(TYPE_CN[c.type]||c.type)}</span>
          <span class="badge b-rare">${esc(RARE_CN[c.rarity]||c.rarity)}</span>
          <span class="badge" style="color:${cc};background:color-mix(in srgb, var(--char-${c.char}) 12%, transparent);border-color:color-mix(in srgb, var(--char-${c.char}) 28%, transparent)">${esc(CHAR_CN[c.char]||c.char)}</span>
        </div>
        <p style="font-size:12px;color:var(--text-mute);margin:14px 0 0;line-height:1.6">
          升级前后对照：${sameText && sameCost ? '该卡升级后 <b>数值无变化</b>' : '查看右侧橙色框的升级版'}.
          <br>卡牌 ID：<code style="background:var(--surface-2);padding:1px 6px;border-radius:5px">${esc(c.slug)}</code>
        </p>
      </div>
    </div>
    <div class="sheet-body">
      <div class="vers">
        <div class="ver">
          <div class="ver-hd"><span class="t">基础版</span>${c.cost!==''?`<span class="cost${String(c.cost)==='X'?' x':''}">${esc(c.cost)}${c.starCost?`<span class="c-star">${esc(c.starCost)}</span>`:''}</span>`:''}</div>
          <div class="ver-desc">${descHTML(c.desc)}</div>
        </div>
        <div class="ver up">
          <div class="ver-hd"><span class="t">升级版</span>${c.costUp!==''?`<span class="cost${String(c.costUp)==='X'?' x':''}">${esc(c.costUp ?? c.cost)}${c.starCostUp?`<span class="c-star">${esc(c.starCostUp)}</span>`:''}</span>`:''}</div>
          <div class="ver-desc">${descHTML(c.descUp)}</div>
        </div>
      </div>
      ${(sameText && sameCost) ? '<div class="note-line">该卡牌升级后数值无变化</div>' : ''}
      ${histHTML(c)}
    </div>`;
  $('#modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  // bind actions
  sheet.querySelector('.prev')?.addEventListener('click', () => stepModal(-1));
  sheet.querySelector('.next')?.addEventListener('click', () => stepModal(+1));
  sheet.querySelector('#modalFav')?.addEventListener('click', e => {
    const on = toggleFav(c.slug);
    e.currentTarget.classList.toggle('on', on);
    e.currentTarget.textContent = on ? '★' : '☆';
    e.currentTarget.title = on ? '取消收藏' : '收藏';
    // update grid card star if visible
    const cardStar = document.querySelector(`.card[data-slug="${CSS.escape(c.slug)}"] .c-fav`);
    if (cardStar){
      cardStar.classList.toggle('on', on);
      cardStar.textContent = on ? '★' : '☆';
    }
    if (state.favOnly) apply();
  });
  sheet.querySelector('#copyLink')?.addEventListener('click', async e => {
    const url = location.origin + location.pathname + '#card/' + c.slug;
    try{
      await navigator.clipboard.writeText(url);
      const b = e.currentTarget;
      b.classList.add('copied');
      b.lastChild.textContent = '已复制';
      setTimeout(() => { b.classList.remove('copied'); b.lastChild.textContent = '复制链接'; }, 1500);
    }catch(_){
      // fallback: select
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); }catch(_){}
      ta.remove();
    }
  });
  // update hash without triggering handler
  if (location.hash !== '#card/' + c.slug){
    history.replaceState(null, '', '#card/' + c.slug);
  }
}
function stepModal(d){
  const i = APP.currentIndex + d;
  if (i < 0 || i >= results.length) return;
  openModal(results[i], i);
}
APP.openCardBySlug = openCardBySlug;
APP.closeModal = function(){
  $('#modal').classList.remove('open');
  document.body.style.overflow = '';
  APP.currentIndex = -1;
  if (location.hash.startsWith('#card/')){
    history.replaceState(null, '', location.pathname);
  }
};
$('#modal').addEventListener('click', e => {
  if (e.target.id === 'modal'){ APP.closeModal(); return; }
  // 版本历史折叠（事件委托：绑定一次，innerHTML 重建后仍有效）
  const tg = e.target.closest('#histToggle');
  if (tg){
    const box = document.getElementById('histBox');
    if (box){
      const on = box.classList.toggle('open');
      tg.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
  }
});

/* ---------------- global keys ---------------- */
document.addEventListener('keydown', e => {
  // ignore when typing in inputs (except our shortcuts)
  const ae = document.activeElement;
  const inField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  if (e.key === 'Escape'){
    if ($('#modal').classList.contains('open')){ APP.closeModal(); return; }
    if (inField && ae.id === 'q' && state.q){
      ae.value = ''; state.q = ''; $('#searchBox').classList.remove('has-val'); apply(); return;
    }
    if (inField && ae.id === 'q'){ ae.blur(); return; }
  }
  if (!inField){
    if (e.key === '/'){ e.preventDefault(); $('#q').focus(); $('#q').select(); return; }
    if ($('#modal').classList.contains('open')){
      if (e.key === 'ArrowLeft'){ e.preventDefault(); stepModal(-1); return; }
      if (e.key === 'ArrowRight'){ e.preventDefault(); stepModal(+1); return; }
    }
  }
});

/* ---------------- search events ---------------- */
let _qTimer;
$('#q').addEventListener('input', e => {
  clearTimeout(_qTimer);
  const v = e.target.value;
  $('#searchBox').classList.toggle('has-val', !!v);
  _qTimer = setTimeout(() => { state.q = v; apply(); }, 140);
});
$('#qClear').addEventListener('click', () => {
  $('#q').value = ''; $('#q').focus();
  $('#searchBox').classList.remove('has-val');
  state.q = ''; apply();
});
$('#sort').addEventListener('change', e => { state.sort = e.target.value; apply(); });
$('#verSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  [...e.currentTarget.children].forEach(x => x.classList.toggle('on', x === b));
  state.ver = b.dataset.v; apply();
});
function resetAll(){
  state.q=''; state.chars.clear(); state.types.clear(); state.rares.clear(); state.costs.clear(); state.starCosts.clear();
  state.extra.clear(); state.favOnly = false;
  state.sort='default'; state.ver='base';
  $('#q').value=''; $('#searchBox').classList.remove('has-val'); $('#sort').value='default';
  [...$('#verSeg').children].forEach((x,i)=>x.classList.toggle('on', i===0));
  document.querySelectorAll('.chip.on').forEach(x=>x.classList.remove('on'));
  apply(); window.scrollTo({top:0,behavior:'smooth'});
}
APP.resetAll = resetAll;
$('#reset').addEventListener('click', resetAll);

/* ---------------- random FAB ---------------- */
$('#fabLink').addEventListener('click', e => {
  e.preventDefault();
  if (!results.length) return;
  const idx = Math.floor(Math.random() * results.length);
  openModal(results[idx], idx);
});
window.addEventListener('scroll', () => {
  const show = window.scrollY > 300 && results.length > 0;
  $('#fab').classList.toggle('show', show);
}, {passive:true});

/* ---------------- hash deep link ---------------- */
function handleHash(){
  const m = location.hash.match(/^#card\/([\w-]+)/);
  if (m){
    const slug = m[1];
    const c = APP.CARDS.find(x => x.slug === slug);
    if (c){
      // ensure shown
      const idx = results.findIndex(x => x.slug === slug);
      openModal(c, idx);
    }
  }
}
window.addEventListener('hashchange', () => { apply(); handleHash(); });

/* ==========================================================
   卡名接龙对战
   ========================================================== */
const G = { ws:null, connected:false, mode:null, me:0, state:null, last:null, used:new Set(), inGame:false, timerInt:null, acIndex:-1, rules:{ban:false, homo:false, gen1:false} };
let NAMES = [];
let NAMESET = new Set();
const HAN = new Map();        // 卡名 -> 汉字集合（精确接龙）
const PIN = new Map();        // 卡名 -> 拼音音节集合（同音接龙）
const GAMEOF = new Map();     // 卡名 -> 'sts1'（仅一代独有的卡，用于「禁用一代卡牌」规则）
const PINYIN_MAP = (typeof window !== 'undefined' && window.PINYIN_MAP) || {};
const isBanned = (n) => /打击/.test(n) || /形态/.test(n);
const shareChar = (a,b) => { const ha=HAN.get(a), hb=HAN.get(b); if(!ha||!hb) return false; for(const c of ha) if(hb.has(c)) return true; return false; };
const syllablesOf = (n) => { const s = new Set(); for (const ch of n){ const p = PINYIN_MAP[ch]; if (p) s.add(p); } return s; };
const shareSyllable = (a,b) => { const ha=PIN.get(a), hb=PIN.get(b); if(!ha||!hb) return false; for(const p of ha) if(hb.has(p)) return true; return false; };
// 接龙判定：rules.homo 开启时读音相同即可（仍兼容完全相同汉字），否则需相同汉字
const canChain = (a,b,rules) => {
  if (rules && rules.homo) return shareSyllable(a,b) || shareChar(a,b);
  return shareChar(a,b);
};
// 接龙对战名集合需覆盖两款图鉴（StS2 + StS1），故从已加载的两份数据并集合成
function initBattleNames(){
  const all = [...(DATA.sts2 ? DATA.sts2.cards : []), ...(DATA.sts1 ? DATA.sts1.cards : [])];
  NAMES = [...new Set(all.map(c => c.name).filter(Boolean))];
  NAMESET = new Set(NAMES);
  HAN.clear(); PIN.clear();
  NAMES.forEach(n => {
    HAN.set(n, new Set([...n].filter(c => /[一-鿿]/.test(c))));
    PIN.set(n, syllablesOf(n));
  });
  // 仅一代（StS1）独有的卡标记为 sts1（与二代重名的如「打击」不计入，禁用一代规则放行）
  const s2 = new Set((DATA.sts2 ? DATA.sts2.cards : []).map(c => c.name));
  GAMEOF.clear();
  (DATA.sts1 ? DATA.sts1.cards : []).forEach(c => { if (c.name && !s2.has(c.name)) GAMEOF.set(c.name, 'sts1'); });
}

let _sendQ = [];
function connect(){
  if (G.ws && (G.ws.readyState === 1 || G.ws.readyState === 0)) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  let ws;
  try { ws = new WebSocket(proto + '://' + location.host); } catch(e){ return; }
  G.ws = ws;
  ws.onopen = () => { G.connected = true; const q=_sendQ; _sendQ=[]; q.forEach(o => { try{ ws.send(JSON.stringify(o)); }catch(_){} }); };
  ws.onmessage = e => { try { handle(JSON.parse(e.data)); } catch(_) {} };
  ws.onclose = () => { G.connected = false; _sendQ=[]; if (G.inGame) setHint('✗ 与服务器断开连接', 'bad'); };
  ws.onerror = () => { $('#setup-hint').textContent = '⚠ 无法连接对战服务器（请确认通过服务器访问本页，而非本地双击打开）'; };
}
function send(o){
  if (G.ws && G.ws.readyState === 1) { try { G.ws.send(JSON.stringify(o)); } catch(_){ _sendQ.push(o); } }
  else _sendQ.push(o);
}
function getNick(){ try{ return localStorage.getItem('sts2-nick') || ''; }catch(e){ return ''; } }
function setNick(v){ try{ localStorage.setItem('sts2-nick', v); }catch(e){} }
function switchPanel(id){
  ['p-setup','p-lobby','p-game','p-over'].forEach(p => $('#'+p).classList.toggle('on', p===id));
}
function lobby(title, sub, code){
  $('#lobby-title').textContent = title;
  $('#lobby-sub').textContent = sub;
  if (code){ $('#lobby-code').style.display='flex'; $('#lobby-code-val').textContent = code; }
  else { $('#lobby-code').style.display='none'; }
  switchPanel('p-lobby');
}
function setHint(t, cls){ const h=$('#hint'); h.className='hint '+(cls||'info'); h.innerHTML=t; }
function handle(m){
  switch(m.type){
    case 'waiting': lobby('正在匹配对手…','请稍候，系统正在为你寻找其他玩家', null); break;
    case 'created': lobby('已创建房间','把房间码发给朋友即可对战', m.code); break;
    case 'joined': lobby('已加入房间','等待房主开始对战…', null); break;
    case 'start':
    case 'update': G.me = (m.state.you!==null && m.state.you!==undefined) ? m.state.you : G.me; renderGame(m.state); break;
    case 'error':
      if (G.inGame) setHint('✗ '+esc(m.msg), 'bad');
      else { $('#setup-hint').textContent = '⚠ '+m.msg; }
      break;
    case 'over': showOver(m); break;
  }
}
function renderGame(s){
  G.inGame = true; G.state = s; G.last = s.last; G.used = new Set(s.log.map(x => x.word));
  if (s.rules) G.rules = s.rules;
  switchPanel('p-game');
  s.players.forEach((p,i) => {
    const card = $('#pc-'+i);
    card.querySelector('.nm-t').textContent = p.name;
    card.classList.toggle('turn', i === s.turn);
    const yt = card.querySelector('.you-tag'); if (yt) yt.style.display = (i === s.you) ? 'inline-block' : 'none';
    card.querySelector('.role').textContent = (i === s.you) ? '（你）' : '';
  });
  const cc = $('#chain-card');
  if (!s.last){ $('#chain-lbl').textContent = (s.turn === s.you) ? '你先手！随意出一张卡牌' : '对手先手'; $('#chain-word').textContent = '—'; cc.classList.remove('first'); }
  else { $('#chain-lbl').textContent = G.rules.homo ? '需要接龙（读音相同即可）' : '需要接龙（含相同汉字）'; $('#chain-word').textContent = s.last; cc.classList.add('first'); }
  // 规则标签
  const rl = $('#rules-line'); const chips = [];
  if (G.rules.ban) chips.push('禁用 打击/形态 牌');
  if (G.rules.homo) chips.push('同音字可接龙');
  if (G.rules.gen1) chips.push('禁用一代卡牌');
  rl.innerHTML = chips.map(c => `<span class="rule-chip">${esc(c)}</span>`).join('');
  const myTurn = s.turn === s.you;
  const inp = $('#play-input');
  inp.disabled = !myTurn; $('#submit-btn').disabled = !myTurn;
  $('#turn-who').innerHTML = myTurn ? '<b style="color:var(--accent)">轮到你出牌</b>' : ('等待「'+esc(s.players[s.turn].name)+'」出牌…');
  renderLog(s.log, s.you);
  if (myTurn) setTimeout(() => inp.focus(), 60); else { inp.value=''; closeAC(); }
  validateInput();
  startTimer(s.deadline);
}
function renderLog(log, you){
  const el = $('#log'); el.innerHTML='';
  log.forEach((e,i) => {
    const mine = e.who === you;
    const row = document.createElement('div');
    row.className = 'log-row ' + (mine ? 'mine' : 'opp');
    row.innerHTML = `<span class="who">${mine?'你':(G.state.players[e.who] ? G.state.players[e.who].name.slice(0,1) : '?')}</span><span class="w">${esc(e.word)}</span>`;
    el.appendChild(row);
  });
  el.scrollTop = el.scrollHeight;
}
function startTimer(deadline){
  if (G.timerInt) clearInterval(G.timerInt);
  const C = 169.6, RING = $('#ring'), FG = $('#ring-fg'), NUM = $('#ring-num');
  const tick = () => {
    const remain = Math.max(0, (deadline - Date.now())/1000);
    const frac = remain/30;
    FG.setAttribute('stroke-dashoffset', (C*(1-frac)).toFixed(1));
    NUM.textContent = Math.ceil(remain);
    RING.classList.toggle('low', remain <= 10);
    if (remain <= 0){ clearInterval(G.timerInt); G.timerInt=null; }
  };
  tick(); G.timerInt = setInterval(tick, 250);
}
function validateInput(){
  const inp = $('#play-input'); const v = inp.value.trim();
  if (!G.state) return false;
  if (G.state.turn !== G.state.you){
    setHint('等待对手出牌…', 'info'); return false;
  }
  if (!v){ setHint(G.rules.homo ? '输入卡牌名，读音与上家相同即可接龙（杀戮尖塔1 / 2 均可）' : '输入卡牌名，需与上家共享汉字（杀戮尖塔1 / 2 均可）', 'info'); return false; }
  if (!NAMESET.has(v)){ setHint('✗ 这张卡不在本图鉴收录中', 'bad'); return false; }
  if (G.rules.ban && isBanned(v)){ setHint('✗ 当前规则禁用含「打击」「形态」的卡牌', 'bad'); return false; }
  if (G.rules.gen1 && GAMEOF.has(v)){ setHint('✗ 当前规则禁用一代（杀戮尖塔1）卡牌', 'bad'); return false; }
  if (G.used.has(v)){ setHint('✗ 这张牌本局已经出过了', 'bad'); return false; }
  if (G.last && !canChain(v, G.last, G.rules)){ setHint(G.rules.homo ? ('✗ 需与「'+esc(G.last)+'」读音相同') : ('✗ 需与「'+esc(G.last)+'」至少有一个相同汉字'), 'bad'); return false; }
  setHint(G.last ? ('✓ 可接「'+esc(G.last)+'」') : '✓ 出牌有效', 'ok'); return true;
}
function openAC(){
  const inp = $('#play-input'); const q = inp.value.trim().toLowerCase();
  const ac = $('#ac');
  if (!q || G.state.turn !== G.state.you){ closeAC(); return; }
  let pool = NAMES.filter(n => n.toLowerCase().includes(q));
  pool = pool.filter(n => !G.used.has(n) && (!G.rules.ban || !isBanned(n)) && (!G.rules.gen1 || !GAMEOF.has(n)) && (!G.last || canChain(n, G.last, G.rules)));
  pool = pool.slice(0, 8);
  if (!pool.length){ closeAC(); return; }
  G.acPool = pool;
  if (G.acIndex >= pool.length) G.acIndex = pool.length - 1;
  ac.innerHTML = pool.map((n,i) => {
    const t = TYPE_CN[ (APP.CARDS.find(c=>c.name===n)||{}).type ] || '';
    return `<div class="ac-item${i===G.acIndex?' kbd':''}" data-name="${esc(n)}"><span>${esc(n)}</span><span class="badge b-type">${esc(t)}</span></div>`;
  }).join('');
  [...ac.children].forEach(ch => ch.onclick = () => { inp.value = ch.dataset.name; closeAC(); validateInput(); inp.focus(); });
  ac.classList.add('on');
}
function closeAC(){ $('#ac').classList.remove('on'); G.acIndex=-1; }
function submit(){
  const inp = $('#play-input'); const v = inp.value.trim();
  if (!validateInput()) return;
  send({ type:'play', word:v });
  inp.value=''; closeAC(); validateInput();
}
function showOver(m){
  G.inGame = false; if (G.timerInt){ clearInterval(G.timerInt); G.timerInt=null; }
  const win = m.winner === G.me;
  const REASON = {
    timeout: win ? '对手在 30 秒内未能接上' : '你未在 30 秒内接上',
    left:    win ? '对手离开了房间' : '你离开了房间',
  };
  const reasonTxt = REASON[m.reason] || '对局结束';
  const badge = $('#over-badge');
  badge.textContent = win ? '胜 利' : (m.reason === 'left' ? '对手离开' : '失 败');
  badge.className = 'badge-big ' + (win ? 'win' : 'lose');
  $('#over-title').textContent = win ? '🎉 你赢了！' : (m.reason === 'left' ? '对手离开了' : '惜败');
  $('#over-sub').textContent = reasonTxt;
  if (m.state){
    $('#over-mine').textContent = m.state.log.filter(x => x.who === G.me).length;
    $('#over-opp').textContent = m.state.log.filter(x => x.who !== G.me).length;
    $('#over-used').textContent = m.state.usedCount;
  }
  switchPanel('p-over');
}
function bindPlay(){
  document.querySelectorAll('.mode-btn').forEach(b => b.onclick = () => {
    G.mode = b.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(x => x.classList.toggle('on', x===b));
    $('#join-field').style.display = (G.mode==='join') ? 'block' : 'none';
    $('#setup-hint').textContent = '';
  });
  $('#go-btn').onclick = () => {
    const nick = $('#nick').value.trim() || ('玩家'+Math.floor(Math.random()*900+100));
    setNick(nick); connect();
    const rules = { ban: !!$('#rule-ban').checked, homo: !!$('#rule-homo').checked, gen1: !!$('#rule-gen1').checked };
    if (!G.mode){ $('#setup-hint').textContent='请先选择一种对战模式'; return; }
    if (G.mode === 'join'){
      const code = $('#roomcode').value.trim().toUpperCase();
      if (!code){ $('#setup-hint').textContent='请输入要加入的房间码'; return; }
      send({ type:'join', code, name:nick, rules }); lobby('正在加入房间…','等待房主开始对战…', null); return;
    }
    if (G.mode === 'quick'){ send({ type:'quick', name:nick, rules }); lobby('正在匹配对手…','请稍候，系统正在为你寻找其他玩家', null); return; }
    if (G.mode === 'create'){ send({ type:'create', name:nick, rules }); lobby('已创建房间','把房间码发给朋友即可对战', null); return; }
  };
  $('#copy-code').onclick = () => { const t=$('#lobby-code-val').textContent; try{ navigator.clipboard.writeText(t); $('#copy-code').textContent='已复制'; setTimeout(()=>$('#copy-code').textContent='复制',1200);}catch(e){} };
  $('#cancel-btn').onclick = () => { send({ type:'leave' }); switchPanel('p-setup'); };
  $('#leave-btn').onclick = () => { send({ type:'leave' }); G.inGame=false; switchPanel('p-setup'); };
  $('#again-btn').onclick = () => { send({ type:'again' }); };
  $('#back-btn').onclick = () => { send({ type:'leave' }); switchPanel('p-setup'); };
  const inp = $('#play-input');
  inp.addEventListener('input', () => { G.acIndex=-1; validateInput(); openAC(); });
  inp.addEventListener('keydown', e => {
    const ac = $('#ac');
    if (e.key === 'Enter'){ e.preventDefault(); if (ac.classList.contains('on')){ const first=ac.querySelector('.ac-item'); if(first){ inp.value=first.dataset.name; closeAC(); validateInput(); return; } } submit(); }
    else if (e.key === 'Escape'){ closeAC(); }
  });
  $('#submit-btn').addEventListener('mousedown', closeAC);
  $('#submit-btn').onclick = submit;
  document.addEventListener('click', e => { if (!e.target.closest('#ac') && e.target !== inp) closeAC(); });
}
function showView(v){
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.view===v));
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id==='view-'+v));
  if (v === 'play') connect();
  if (v === 'quiz') qzInfo();
}
function bindNav(){
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t => t.onclick = () => showView(t.dataset.view));
}

/* ================= 二选一答题 ================= */
const QZ = { cur:null, seen:new Set(), ids:[], deck:[], pos:0, idx:0, answered:0, agree:0, mino:0, busy:false };
function shuffle(arr){ const a = arr.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
const qzEl = id => document.getElementById(id);
function qzHint(msg, kind){
  const h = qzEl('qz-hint'); if(!h) return;
  h.textContent = msg || '';
  h.className = 'hint' + (kind ? ' ' + kind : ' info');
}
function qzPanel(which){
  qzEl('qz-start').style.display = which==='start' ? '' : 'none';
  qzEl('qz-play').style.display  = which==='play'  ? '' : 'none';
  qzEl('qz-over').style.display  = which==='over'  ? '' : 'none';
  const ad = qzEl('qz-admin'); if (ad) ad.style.display = which==='admin' ? '' : 'none';
  if (which === 'admin'){ admRender(); if (ADM.token) admLoad(); }
}
async function qzInfo(){
  const el = qzEl('qz-stat'); if(!el) return;
  try{
    const r = await fetch('/api/quiz/info', {cache:'no-store'});
    const j = await r.json();
    const el2 = qzEl('qz-stat'); if (el2) el2.style.color = '';
    if (j.ok){ el.textContent = `题库 ${j.count} 题 · 累计 ${j.votes} 次选择`; QZ.ids = j.ids || []; }
    else el.textContent = '题库暂无数据';
  }catch(e){ el.textContent = '题库 — 题 · 累计 — 次选择'; }
}
// 整轮会话内持续去重：开局把题库洗成一副牌依次发；本题库抽完即结束（不再自动重洗续接）
function qzReset(){
  QZ.seen.clear(); QZ.idx = 0; QZ.answered = 0; QZ.agree = 0; QZ.mino = 0; QZ.cur = null;
  QZ.deck = QZ.ids.length ? shuffle(QZ.ids) : []; QZ.pos = 0;
}
// 「再来一轮」：用户主动从头重洗一副新牌，完整重玩一遍
function qzResetRound(){
  QZ.seen.clear(); QZ.idx = 0; QZ.answered = 0; QZ.agree = 0; QZ.mino = 0; QZ.cur = null;
  QZ.deck = QZ.ids.length ? shuffle(QZ.ids) : []; QZ.pos = 0;
}
async function qzNext(){
  if (QZ.busy) return;
  QZ.busy = true; qzHint('加载中…', 'info');
  try{
    let url;
    if (QZ.ids.length){
      // 牌堆模式：依次取洗好的题目；本题库已抽完则直接结算结束
      if (QZ.pos >= QZ.deck.length){
        qzFinish();
        return;
      }
      const id = QZ.deck[QZ.pos++];
      url = '/api/quiz/next?id=' + encodeURIComponent(id);
    } else {
      // 兜底：服务端随机 + ex 去重（极端情况下仍允许续玩）
      const ex = [...QZ.seen].slice(-300).join(',');
      url = '/api/quiz/next?ex=' + encodeURIComponent(ex);
    }
    const r = await fetch(url, {cache:'no-store'});
    const j = await r.json();
    if (!j.ok){
      qzPanel('start');
      const st = qzEl('qz-stat');
      if (st){ st.textContent = (j.msg || '题库是空的') + ' —— 在 quiz.txt 里加几行题目吧'; st.style.color = 'var(--r-curse)'; }
      return;
    }
    QZ.cur = j.q; QZ.seen.add(j.q.id); QZ.idx++;
    qzPanel('play');
    const total = j.total || QZ.ids.length || 0;
    qzEl('qz-prog').textContent = '第 ' + QZ.idx + ' / ' + total + ' 题（去重）';
    const tag = qzEl('qz-tag'); tag.textContent = j.q.tag || ''; tag.style.display = j.q.tag ? '' : 'none';
    qzEl('qz-q').textContent = j.q.q;
    qzEl('qz-a').querySelector('.qz-t').textContent = j.q.a;
    qzEl('qz-b').querySelector('.qz-t').textContent = j.q.b;
    [qzEl('qz-a'), qzEl('qz-b')].forEach(b => { b.classList.remove('picked','win','lose'); b.disabled = false; });
    qzEl('qz-result').style.display = 'none'; qzEl('qz-result').innerHTML = '';
    qzEl('qz-next').style.display = 'none'; qzEl('qz-skip').style.display = '';
    qzHint('选一个吧', 'info');
  }catch(e){ qzHint('加载失败：' + e.message, 'bad'); }
  QZ.busy = false;
}
async function qzChoose(i){
  if (!QZ.cur || QZ.busy) return;
  QZ.busy = true;
  const btns = [qzEl('qz-a'), qzEl('qz-b')];
  btns.forEach(b => b.disabled = true);
  btns[i].classList.add('picked');
  try{
    const r = await fetch('/api/quiz/vote', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: QZ.cur.id, choice: i }),
    });
    const j = await r.json();
    if (!j.ok){
      btns.forEach(b => b.disabled = false); btns[i].classList.remove('picked');
      qzHint(j.msg || '提交失败', 'bad'); QZ.busy = false; return;
    }
    QZ.answered++;
    const winIdx = j.more === 'tie' ? -1 : (j.more === 'a' ? 0 : 1);
    if (winIdx === -1) { /* 平局不计数 */ }
    else if (winIdx === j.mine) QZ.agree++;
    else QZ.mino++;
    qzRenderResult(j, i, winIdx);
    btns.forEach((b, k) => { if (k === winIdx) b.classList.add('win'); else if (winIdx !== -1) b.classList.add('lose'); });
    qzEl('qz-next').style.display = ''; qzEl('qz-skip').style.display = 'none';
    qzHint('', 'info');
  }catch(e){
    btns.forEach(b => b.disabled = false); btns[i].classList.remove('picked');
    qzHint('提交失败：' + e.message, 'bad');
  }
  QZ.busy = false;
}
function qzRenderResult(j, mine, winIdx){
  const labels = [QZ.cur.a, QZ.cur.b];
  const counts = [j.a, j.b], pcts = [j.pa, j.pb];
  let html = '';
  if (winIdx === -1){
    html += '<div class="qz-verdict tie">两边打平了，各 ' + j.pa + '%</div>';
  } else {
    const same = (winIdx === mine);
    html += '<div class="qz-verdict ' + (same ? 'same' : 'diff') + '">'
      + (same ? '你和多数人想的一样 🎉' : '你是少数派 🤔')
      + '　更多人（<b>' + pcts[winIdx] + '%</b>）选择了「' + esc(labels[winIdx]) + '」</div>';
  }
  for (let k = 0; k < 2; k++){
    const isWin = (winIdx === k), isMine = (mine === k);
    html += '<div class="qz-bar' + (isWin ? ' win' : '') + (isMine ? ' mine' : '') + '">'
      + '<div class="qz-bar-top"><span class="qz-bar-lbl">'
      + (isMine ? '<i class="qz-you">你的选择</i>' : '')
      + esc(labels[k]) + (isWin ? '<b class="qz-badge">多数</b>' : '')
      + '</span><span class="qz-bar-pct">' + pcts[k] + '%</span></div>'
      + '<div class="qz-bar-track"><div class="qz-bar-fill" style="width:' + Math.max(pcts[k], 1.5) + '%"></div></div>'
      + '<div class="qz-bar-sub">' + counts[k] + ' 人</div>'
      + '</div>';
  }
  html += '<div class="qz-total">共 ' + j.total + ' 人回答过这道题</div>';
  const box = qzEl('qz-result');
  box.innerHTML = html; box.style.display = '';
}
function qzFinish(){
  qzEl('qz-over-answered').textContent = QZ.answered;
  qzEl('qz-over-agree').textContent = QZ.agree;
  qzEl('qz-over-mino').textContent = QZ.mino;
  const rate = QZ.answered ? Math.round(QZ.agree / QZ.answered * 100) : 0;
  qzEl('qz-over-badge').textContent = QZ.answered === 0 ? '🎯' : (rate >= 70 ? '🐑' : (rate >= 40 ? '🎯' : '🐺'));
  qzEl('qz-over-title').textContent = QZ.answered === 0 ? '本轮结束' : (rate >= 70 ? '你很合群' : (rate >= 40 ? '你挺有自己的想法' : '你是天生的少数派'));
  qzEl('qz-over-sub').textContent = QZ.answered === 0 ? '这一轮还没答题' : ('本轮 ' + QZ.answered + ' 题中，有 ' + QZ.agree + ' 题你和多数人一致（' + rate + '%）');
  qzPanel('over');
  qzInfo();
}
/* ---------------- 题库后台（网页端维护 · 口令保护） ---------------- */
const ADM = { token: '' };
try { ADM.token = localStorage.getItem('qzAdmToken') || ''; } catch(_){}
function admEl(id){ return document.getElementById(id); }
function admMsg(msg, kind, elId){
  const el = admEl(elId || 'qz-adm-msg'); if(!el) return;
  el.textContent = msg || '';
  el.className = 'qz-adm-msg' + (kind ? (' ' + kind) : '');
}
// 本地解析题库文本，用于实时预览（规则与服务端保持一致）
function admParse(raw){
  const list = [], bad = [];
  String(raw || '').replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const p = s.split('|').map(x => x.trim());
    if (p.length < 3 || !p[0] || !p[1] || !p[2]) { bad.push(i + 1); return; }
    list.push({ q: p[0], a: p[1], b: p[2], tag: p[3] || '' });
  });
  return { list, bad };
}
function admPreview(){
  const r = admParse(admEl('qz-adm-raw').value);
  const el = admEl('qz-adm-preview');
  if (el){
    let h = '识别到 <b>' + r.list.length + '</b> 道题';
    if (r.bad.length) h += ' · <span class="warn">第 ' + r.bad.slice(0, 8).join('、') + ' 行格式不对，会被忽略</span>';
    el.innerHTML = h;
  }
  return r;
}
async function admApi(p, data){
  const r = await fetch(p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: ADM.token }, data || {})),
  });
  let j = {};
  try { j = await r.json(); } catch(_){ j = { ok:false, msg:'服务器返回异常' }; }
  if (j.needLogin){
    ADM.token = '';
    try { localStorage.removeItem('qzAdmToken'); } catch(_){}
    admRender();
  }
  return j;
}
function admRender(){
  const lg = admEl('qz-adm-login'), mn = admEl('qz-adm-main');
  if (!lg || !mn) return;
  const on = !!ADM.token;
  lg.style.display = on ? 'none' : '';
  mn.style.display = on ? '' : 'none';
  if (!on){ const p = admEl('qz-adm-pass'); if (p) p.value = ''; }
}
async function admLoad(){
  const j = await admApi('/api/quiz/admin/load');
  if (!j.ok){ admMsg(j.msg || '载入失败', 'bad'); return false; }
  admEl('qz-adm-raw').value = j.raw || '';
  admEl('qz-adm-stat').textContent = '题库 ' + j.count + ' 题 · 累计 ' + j.votes + ' 次选择';
  admPreview();
  return true;
}
async function admSave(){
  const raw = admEl('qz-adm-raw').value;
  if (!admParse(raw).list.length){ admMsg('没有识别到任何有效题目，未保存', 'bad'); return; }
  admMsg('保存中…');
  const j = await admApi('/api/quiz/admin/save', { raw });
  if (!j.ok){ admMsg(j.msg || '保存失败', 'bad'); return; }
  admEl('qz-adm-stat').textContent = '题库 ' + j.count + ' 题 · 累计 ' + j.votes + ' 次选择';
  admMsg(j.msg + (j.bak ? '（已备份上一版为 quiz.txt.bak）' : ''), 'ok');
  qzInfo();
}
function bindQuizAdmin(){
  const link = admEl('qz-admin-link');
  if (!link) return;
  link.onclick = (e) => { e.preventDefault(); qzPanel('admin'); };
  admEl('qz-adm-back').onclick = () => { qzPanel('start'); qzInfo(); };

  admEl('qz-adm-login-btn').onclick = async () => {
    const p = admEl('qz-adm-pass').value;
    if (!p){ admMsg('请输入口令', 'bad', 'qz-adm-login-msg'); return; }
    admMsg('正在登录…', '', 'qz-adm-login-msg');
    let j = {};
    try {
      const r = await fetch('/api/quiz/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: p }),
      });
      j = await r.json();
    } catch(_){ j = { ok:false, msg:'网络异常，登录失败' }; }
    if (!j.ok){ admMsg(j.msg || '登录失败', 'bad', 'qz-adm-login-msg'); return; }
    ADM.token = j.token;
    try { localStorage.setItem('qzAdmToken', j.token); } catch(_){}
    admMsg('', '', 'qz-adm-login-msg');
    admRender();
    admLoad();
  };

  admEl('qz-adm-reload').onclick = async () => { admMsg('载入中…'); if (await admLoad()) admMsg('已载入最新题库', 'ok'); };
  admEl('qz-adm-logout').onclick = () => {
    ADM.token = '';
    try { localStorage.removeItem('qzAdmToken'); } catch(_){}
    admRender();
  };
  admEl('qz-adm-raw').addEventListener('input', admPreview);
  admEl('qz-adm-save').onclick = () => admSave();
  admEl('qz-adm-copy').onclick = async () => {
    const t = admEl('qz-adm-raw');
    try { await navigator.clipboard.writeText(t.value); admMsg('已复制到剪贴板', 'ok'); }
    catch(_){ t.focus(); t.select(); admMsg('已全选，按 Ctrl+C 复制', 'ok'); }
  };

  // 快速追加：粘贴若干行 -> 追加到题库末尾并保存
  admEl('qz-adm-append').onclick = async () => {
    const add = admEl('qz-adm-add').value.replace(/^\s+|\s+$/g, '');
    if (!add){ admMsg('请先粘贴要追加的题目', 'bad'); return; }
    if (!admParse(add).list.length){ admMsg('没识别到有效题目，请检查格式：题目|选项A|选项B', 'bad'); return; }
    let raw = admEl('qz-adm-raw').value.replace(/\s+$/, '');
    admEl('qz-adm-raw').value = raw ? (raw + '\n' + add) : add;
    admEl('qz-adm-add').value = '';
    await admSave();
  };

  // 票数备份 / 恢复 / 清空
  admEl('qz-adm-vexport').onclick = async () => {
    const j = await admApi('/api/quiz/admin/votes', { op: 'export' });
    if (!j.ok){ admMsg(j.msg || '导出失败', 'bad'); return; }
    const box = admEl('qz-adm-vdata');
    box.style.display = ''; box.value = j.data || '{}';
    admMsg('已导出，请复制保存（共 ' + j.votes + ' 次选择）', 'ok');
  };
  admEl('qz-adm-vimport').onclick = async () => {
    const box = admEl('qz-adm-vdata');
    if (box.style.display === 'none'){
      box.style.display = '';
      admMsg('把之前导出的数据粘贴到下面，再点一次「导入票数」', '');
      return;
    }
    if (!confirm('导入会覆盖当前所有票数，确定继续？')) return;
    const j = await admApi('/api/quiz/admin/votes', { op: 'import', data: box.value });
    admMsg(j.msg || (j.ok ? '导入完成' : '导入失败'), j.ok ? 'ok' : 'bad');
    if (j.ok) admLoad();
  };
  admEl('qz-adm-vclear').onclick = async () => {
    if (!confirm('确定清空所有题目的投票记录？此操作不可恢复。')) return;
    const j = await admApi('/api/quiz/admin/votes', { op: 'clear' });
    admMsg(j.msg || (j.ok ? '已清空' : '清空失败'), j.ok ? 'ok' : 'bad');
    if (j.ok) admLoad();
  };

  // 修改口令
  admEl('qz-adm-pass-btn').onclick = async () => {
    const np = admEl('qz-adm-newpass').value;
    if (!np || np.length < 4){ admMsg('新口令至少 4 位', 'bad'); return; }
    if (!confirm('修改后当前登录会刷新为新口令，确定？')) return;
    const j = await admApi('/api/quiz/admin/pass', { pass: np });
    if (!j.ok){ admMsg(j.msg || '修改失败', 'bad'); return; }
    ADM.token = j.token;
    try { localStorage.setItem('qzAdmToken', j.token); } catch(_){}
    admEl('qz-adm-newpass').value = '';
    admMsg('口令已更新为「' + np + '」，请记牢', 'ok');
  };

  admRender();
  if (ADM.token) admLoad();   // 之前登录过就自动载入
}

function bindQuiz(){
  if (!qzEl('qz-start-btn')) return;
  qzEl('qz-start-btn').onclick = () => { qzReset(); qzNext(); };
  qzEl('qz-a').onclick = () => qzChoose(0);
  qzEl('qz-b').onclick = () => qzChoose(1);
  qzEl('qz-next').onclick = () => qzNext();
  qzEl('qz-skip').onclick = () => qzNext();
  qzEl('qz-end').onclick = () => qzFinish();
  qzEl('qz-again').onclick = () => { qzResetRound(); qzNext(); };
  qzEl('qz-back').onclick = () => { qzPanel('start'); qzInfo(); };
}

/* ---------------- boot / 游戏切换 ---------------- */
function resetFiltersUI(){
  state.q=''; state.chars.clear(); state.types.clear(); state.rares.clear(); state.costs.clear(); state.starCosts.clear();
  state.extra.clear(); state.favOnly=false; state.sort='default'; state.ver='base';
  $('#q').value=''; $('#searchBox').classList.remove('has-val'); $('#sort').value='default';
  [...$('#verSeg').children].forEach(x=>x.classList.toggle('on', x===$('#verSeg').querySelector('[data-v="base"]')));
  document.querySelectorAll('.chip.on').forEach(x=>x.classList.remove('on'));
}

// 带重试的 fetch：扛住网关瞬时 502（网关可能缓存失败响应，故用 no-store + 重试）
async function fetchRetry(url, opts, tries, gap){
  tries = tries || 3; gap = gap || 1000;
  var lastErr;
  for(var i=0;i<tries;i++){
    try{
      var r = await fetch(url, opts);
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    }catch(e){ lastErr = e; if(i<tries-1) await new Promise(function(res){ setTimeout(res, gap); }); }
  }
  throw lastErr;
}

async function loadGame(id){
  if(!GAMES[id]) id='sts2';
  CUR = id;
  const g = GAMES[id];
  let d;
  if (DATA[id]) d = DATA[id];
  else {
    try{
      const r = await fetchRetry(g.file, {cache:'no-store'});
      d = await r.json();
      if(!Array.isArray(d.cards)) throw new Error('bad data');
      DATA[id] = d;
    }catch(e){
      document.getElementById('grid').innerHTML = '<p style="color:var(--text-mute);text-align:center;padding:60px 0">数据加载失败：'+esc(e.message)+'<br><button class="btn-primary" style="margin-top:16px" onclick="location.reload()">点击重试</button></p>';
      return;
    }
  }
  APP.CARDS = d.cards; APP.meta = d.meta;
  applyGameMeta(d.meta);
  initBattleNames();
  loadHistory(id);          // 版本历史异步加载，不阻塞图鉴渲染
  // 标题/副标题/logo/页脚
  document.querySelector('.logo').textContent = g.logo;
  document.querySelector('h1').textContent = g.label + ' · 全卡牌图鉴';
  document.title = g.label + ' · 全卡牌图鉴';
  $('#fTotal').textContent = APP.CARDS.length;
  $('#subtitle').textContent = `${APP.CARDS.length} 张卡牌 · 全分类图鉴 · 含升级版对照`;
  const src = CUR==='sts2'
    ? '数据来源：<a href="https://sts2front.com/zh-cn/cards/" target="_blank" rel="noopener">STS2 中文 Wiki（sts2front）</a> · <a href="https://slaythespire.wiki.gg/" target="_blank" rel="noopener">Slay the Spire Wiki</a> · 卡图：<a href="https://sts2front.com/" target="_blank" rel="noopener">sts2front</a><br>'
    : '数据来源：<a href="https://sts.huijiwiki.com/wiki/%E6%A8%A1%E6%9D%BF:Navbox%E5%8D%A1%E7%89%8C" target="_blank" rel="noopener">灰机wiki 杀戮尖塔 卡牌总览</a> · 卡图：<a href="https://sts.huijiwiki.com/" target="_blank" rel="noopener">sts.huijiwiki.com</a><br>';
  const fsEl = document.querySelector('#footer-src'); if(fsEl) fsEl.innerHTML = src;
  // 返回卡牌图鉴视图
  bindNav();   // 幂等（onclick 覆盖）
  showView('cards');
  resetFiltersUI();
  try{ buildFilters(); apply(); }
  catch(err){ console.error(err); results = APP.CARDS.slice(); state.shown=0; $('#grid').innerHTML=''; while(state.shown<APP.CARDS.length) renderMore(); }
  handleHash();
}

function bindGameSwitch(){
  document.querySelectorAll('.game-btn').forEach(b => b.onclick = () => {
    if(b.dataset.game === CUR) return;
    document.querySelectorAll('.game-btn').forEach(x => x.classList.toggle('on', x===b));
    loadGame(b.dataset.game);
  });
}

async function boot(){
  bindNav();
  bindPlay();
  bindGameSwitch();
  bindQuiz();
  bindQuizAdmin();
  qzInfo();
  const nick = getNick(); if (nick) $('#nick').value = nick;
  // 图鉴数据由打包脚本 data.js（window.STS_DATA）一次性注入，避免并行拉两个大 JSON 被网关 502 拖垮
  try {
    if (!window.STS_DATA) {
      // data.js 的 <script> 标签若被网关 502 掐断，这里主动重试拉取并就地执行，确保自愈不依赖首页脚本
      const r = await fetchRetry('/data.js', {cache:'no-store'});
      const txt = await r.text();
      (new Function(txt))();
    }
    if (window.STS_DATA) {
      DATA.sts2 = window.STS_DATA.sts2;
      DATA.sts1 = window.STS_DATA.sts1;
    } else {
      console.warn('window.STS_DATA 仍缺失（data.js 可能 502）');
    }
  } catch(e){ console.warn('图鉴数据加载失败：', e.message); }
  await loadGame('sts2');
  if (DATA.sts2 && DATA.sts2.cards) window.__APP_OK = true;
}
boot();
