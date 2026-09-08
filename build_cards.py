# -*- coding: utf-8 -*-
"""以灰机wiki(Data:Card.tabx)为唯一数据源，重建 cards.json。
旧站里能按中文名匹配上的卡牌，沿用其已验证可用的 sts2front 立绘路径(art)；
新增卡牌(状态/诅咒/事件/任务/衍生等) art 留空，由前端回退占位。
"""
import json, re, collections

SRC = 'C:/Users/eee/WorkBuddy/2026-09-07-15-59-43/_tabx_raw.txt'
OLD = 'C:/Users/eee/WorkBuddy/2026-09-07-15-59-43/sts2-cards/cards.json'
OUT = 'C:/Users/eee/WorkBuddy/2026-09-07-15-59-43/sts2-cards/cards.json'

# ---- wiki 中文 -> 本站英文键 映射 ----
CHAR_MAP = {
    '铁甲战士':'ironclad','静默猎手':'silent','储君':'regent','亡灵契约师':'necrobinder',
    '故障机器人':'defect','无色':'colorless','事件':'event','状态':'status','诅咒':'curse',
    '任务':'quest','衍生':'derivative',
}
TYPE_MAP = {'攻击':'attack','技能':'skill','能力':'power','状态':'status','诅咒':'curse','任务':'quest'}
RARE_MAP = {'初始':'starter','普通':'common','罕见':'uncommon','稀有':'rare','事件':'event',
            '先古之民':'elder','状态':'status','诅咒':'curse','任务':'quest','衍生':'token'}
COST_MAP = {'零':'0','一':'1','二':'2','三':'3','四':'4','五':'5','七':'7','九':'9','十二':'12','X':'X','无':''}

CHAR_ORDER = ['ironclad','silent','regent','necrobinder','defect','colorless','event','status','curse','quest','derivative']
TYPE_ORDER = ['attack','skill','power','status','curse','quest']
RARE_ORDER = ['starter','common','uncommon','rare','event','elder','status','curse','quest','token']
CHAR_CN = {'ironclad':'铁甲战士','silent':'静默猎手','regent':'储君','necrobinder':'亡灵契约师',
           'defect':'故障机器人','colorless':'无色','event':'事件','status':'状态','curse':'诅咒',
           'quest':'任务','derivative':'衍生'}
TYPE_CN = {'attack':'攻击','skill':'技能','power':'能力','status':'状态','curse':'诅咒','quest':'任务'}
RARE_CN = {'starter':'初始','common':'普通','uncommon':'罕见','rare':'稀有','event':'事件',
           'elder':'先古之民','status':'状态','curse':'诅咒','quest':'任务','token':'衍生'}

def has_cn(t): return bool(re.search(r'[一-鿿]', t or ''))

MARK = '\x01'
def _file_link(m):
    lm = re.search(r'link=([^\]|]+)', m.group(0))
    return MARK + (lm.group(1) if lm else '?') + MARK if lm else ''
def _wiki_link(m):
    inner = m.group(1)
    if re.match(r'(File|文件|Image|图像):', inner, re.I):
        return ''
    segs = inner.split('|')
    return segs[-1] if len(segs) > 1 else segs[0]

def clean_desc(t):
    if not t: return ''
    s = t
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.I)
    s = re.sub(r'\[\[([^\]]+)\]\]', _file_link, s)   # 图标类文件链接 -> 资源标记
    s = re.sub(r'\[\[([^\]]+)\]\]', _wiki_link, s)   # 其余wiki链接 -> 文本
    s = re.sub(r'<[^>]+>', '', s)                    # 其余 HTML 标签
    # 连续相同资源图标 -> N资源（图标数量即数值）
    def _collapse(mm):
        res = mm.group(1); n = mm.group(0).count(MARK + res + MARK)
        return (str(n) if n > 1 else '') + res
    s = re.sub(r'(?:' + MARK + r'([^\x01]+)' + MARK + r')+', _collapse, s)
    # 去尾随重复单位词（图标折叠结果 + wiki 原标签）
    for w in ('能量','辉星','活力','铸造','星辰','星'):
        s = re.sub(r'(' + w + r'){2,}', w, s)
    s = s.replace('\r', '\n')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n\s*\n+', '\n', s)
    return s.strip()

# ---- 载入 wiki 表格 ----
raw = open(SRC, encoding='utf-8').read()
if raw.startswith(')]}'): raw = raw[4:]
tab = json.loads(raw)
fields = [f['name'] for f in tab['schema']['fields']]
rows = [dict(zip(fields, r)) for r in tab['data']]
up = {r['id']: r for r in rows if r['id'].endswith('_upgrade')}

# ---- 旧站 art 按中文名索引 ----
old = json.load(open(OLD, encoding='utf-8'))['cards']
old_art = {}
for c in old:
    old_art.setdefault(c['name'], c.get('art') or '')

cards = []
seen_slug = set()
for r in rows:
    if r['category'] != 'card' or r['id'].endswith('_upgrade'):
        continue
    wid = r['id']
    name = (r['name'] or '').replace('+', '').strip()
    char = CHAR_MAP.get(r['color'], 'colorless')
    typ = TYPE_MAP.get(r['type'], 'attack')
    rare = RARE_MAP.get(r['rarity'], 'common')
    cost = COST_MAP.get(r['cost'], r['cost'])
    desc = clean_desc(r['description'])
    # 升级版
    descUp = ''; costUp = cost
    uid = r['upgrade']
    if uid and uid.endswith('_upgrade') and uid in up:
        wu = up[uid]
        descUp = clean_desc(wu['description'])
        costUp = COST_MAP.get(wu['cost'], wu['cost'])
    upgraded = (descUp and descUp != desc) or (str(costUp) != str(cost) and costUp != '')
    cn = has_cn(name) and has_cn(desc) and (not descUp or has_cn(descUp))
    art = old_art.get(name, '')
    slug = wid[:-len('_upgrade')] if wid.endswith('_upgrade') else wid
    slug = slug.replace('_', '-')
    # 去重（同名不同id时加后缀）
    base_slug = slug
    n = 1
    while slug in seen_slug:
        n += 1; slug = f'{base_slug}-{n}'
    seen_slug.add(slug)
    cards.append({
        'name': name, 'slug': slug, 'cost': cost, 'costUp': costUp,
        'type': typ, 'char': char, 'rarity': rare,
        'desc': desc, 'descUp': descUp, 'art': art,
        'upgraded': upgraded, 'cn': cn,
        'multiplayer_only': r.get('multiplayer_only') == '是',
        'wiki': r.get('page') or name,
    })

# ---- meta ----
meta = {
    'total': len(cards),
    'chars': {k: CHAR_CN[k] for k in CHAR_ORDER},
    'types': {k: TYPE_CN[k] for k in TYPE_ORDER},
    'rarities': {k: RARE_CN[k] for k in RARE_ORDER},
    'charOrder': CHAR_ORDER, 'typeOrder': TYPE_ORDER, 'rareOrder': RARE_ORDER,
}
out = {'meta': meta, 'cards': cards}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# ---- 报告 ----
print('总卡牌数:', len(cards))
print('按分类:')
for grp, mp in (('char', CHAR_CN), ('type', TYPE_CN), ('rarity', RARE_CN)):
    c = collections.Counter(c[grp] for c in cards)
    print(' ', grp, {mp[k]: c[k] for k in (CHAR_ORDER if grp=='char' else TYPE_ORDER if grp=='type' else RARE_ORDER) if c[k]})
print('无费用(状态/诅咒)卡:', sum(1 for c in cards if c['cost'] == ''))
print('升级有变化:', sum(1 for c in cards if c['upgraded']))
print('沿用旧立绘:', sum(1 for c in cards if c['art']))
print('无立绘(占位):', sum(1 for c in cards if not c['art']))
print('描述含中文:', sum(1 for c in cards if c['cn']))
