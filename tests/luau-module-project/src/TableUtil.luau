--[=[
	@class TableUtil
	
	루아 테이블을 다룰 때 자주 사용하는 유틸리티 함수를 묶어 제공합니다.
	배열과 딕셔너리 구조를 간결하게 조작할 수 있도록 도와줍니다.
]=]

-- t-util for Lua 5.1 by Loominatrx
-- Compatible with Luau and Vanilla Lua.

-- Lua's table references
local sort = table.sort
local insert, remove, move = table.insert, table.remove, table.move
local pack, unpack, concat = table.pack, table.unpack, table.concat
local random = math.random

-- Luau's table references
local tfind = table.find
local create = table.create
local clear = table.clear

-- New table
local TableUtil = {}

--#region Public Methods

--[=[
	@within TableUtil
	@function count
	테이블에 들어 있는 요소 수를 반환합니다.
	@param tbl {any} -- 요소를 셀 테이블.
	@return number -- 요소 개수.
]=]
function TableUtil.count(tbl): number
	local n = 0
	for _ in tbl do
		n = n + 1
	end
	return n
end

--[=[
	@within TableUtil
	@function deepCount
	중첩 테이블을 모두 탐색해 요소 수를 계산합니다.
	@param tbl {any} -- 요소를 셀 테이블.
	@return number -- 모든 하위 요소를 포함한 개수.
]=]
function TableUtil.deepCount(tbl): number
	local n = 0
	for _, v in pairs(tbl) do
		n = type(v) == "table" and n + TableUtil.deepCount(v) or n + 1
	end
	return n
end

--[=[
	@within TableUtil
	@function includes
	테이블에 값이 포함되어 있는지 확인합니다.
	@param tbl {any} -- 검색할 테이블.
	@param value any -- 찾을 값.
	@return boolean -- 값이 존재하면 true.
]=]
function TableUtil.includes(tbl, value): boolean
	for _, v in next, tbl do
		if v == value then
			return true
		end
	end
	return false
end

--[=[
	@within TableUtil
	@function isEmpty
	테이블에 값이 전혀 없는지 확인합니다.
	@param tbl {any} -- 검사할 테이블.
	@return boolean -- 비어 있으면 true.
]=]
function TableUtil.isEmpty(tbl): boolean
	return next(tbl) == nil
end

--[=[
	@within TableUtil
	@function isArray
	키가 1..n 형태인지 검사합니다.
	@param tbl {any} -- 검사할 테이블.
	@return boolean -- 배열 형태면 true.
]=]
function TableUtil.isArray(tbl): boolean
	-- Make sure that all keys are positive integers
	for key, value in pairs(tbl) do
		if type(key) ~= "number" or key % 1 ~= 0 or key < 1 then
			return false
		end
	end

	return true
end

--[=[
	@within TableUtil
	@function isDict
	배열이 아닌 사전 형태인지 검사합니다.
	@param tbl {any} -- 검사할 테이블.
	@return boolean -- 사전 형태면 true.
]=]
function TableUtil.isDict(tbl): boolean
	return not TableUtil.isArray(tbl)
end

--[=[
	@within TableUtil
	@function deepClone
	모든 하위 테이블까지 재귀적으로 복제합니다.
	@param tbl T -- 복제할 테이블.
	@return T -- 깊은 복사본.
]=]
function TableUtil.deepClone<T>(tbl: T): T
	local ret = table.clone(tbl :: any) :: any
	for k, v in ret do
		if typeof(v) == "table" then
			ret[k] = TableUtil.deepClone(v)
		end
	end
	return ret
end

--[=[
	@within TableUtil
	@function reverse
	배열형 테이블을 원본에서 역순으로 뒤집습니다.
	@param tbl {any} -- 역순으로 바꿀 배열.
]=]
function TableUtil.reverse<Item>(tbl: { Item })
	if TableUtil.isEmpty(tbl) then
		error("	bl` must not be empty!", 2)
	elseif TableUtil.isDict(tbl) then
		error("	bl` must be a array-like table!", 2)
	end

	for i = 1, #tbl do
		insert(tbl, i, remove(tbl))
	end
end

--[=[
	@within TableUtil
	@function reversed
	원본을 유지한 채 역순 배열을 반환합니다.
	@param tbl {any} -- 복제 대상 배열.
	@return {any} -- 역순 배열 복사본.
]=]
function TableUtil.reversed<Item>(tbl: { Item }): { Item }
	if TableUtil.isEmpty(tbl) then
		error("	bl` must not be empty!", 2)
	elseif TableUtil.isDict(tbl) then
		error("	bl` must be a array-like table!", 2)
	end

	local ret = {}
	for i = #tbl, 1, -1 do
		insert(ret, tbl[i])
	end
	return ret
end

--[=[
	@within TableUtil
	@function keys
	테이블의 키를 배열로 반환합니다.
	@param tbl {[any]: any} -- 키를 추출할 테이블.
	@return {any} -- 키 배열.
]=]
function TableUtil.keys(tbl)
	local ret = {}
	for k in pairs(tbl) do
		insert(ret, k)
	end
	return ret
end

--[=[
	@within TableUtil
	@function values
	테이블의 값을 배열로 반환합니다.
	@param tbl {[any]: any} -- 값을 추출할 테이블.
	@return {any} -- 값 배열.
]=]
function TableUtil.values(tbl)
	local ret = {}
	for _, v in pairs(tbl) do
		insert(ret, v)
	end
	return ret
end

--[=[
	@within TableUtil
	@function randomIpair
	배열형 테이블에서 임의의 인덱스와 값을 돌려줍니다.
	@param tbl {any} -- 대상 배열.
	@return number -- 선택된 인덱스.
	@return any -- 선택된 값.
]=]
function TableUtil.randomIpair(tbl)
	local i = random(#tbl)
	return i, tbl[i]
end

--[=[
	@within TableUtil
	@function randomPair
	사전형 테이블에서 임의의 키와 값을 돌려줍니다.
	@param tbl {[any]: any} -- 대상 테이블.
	@return any -- 선택된 키.
	@return any -- 선택된 값.
]=]
function TableUtil.randomPair(tbl)
	local rand = random(TableUtil.count(tbl))
	local n = 0
	for k, v in pairs(tbl) do
		n = n + 1
		if n == rand then
			return k, v
		end
	end
end

--[=[
	@within TableUtil
	@function sorted
	정렬 결과를 새 배열로 반환합니다.
	@param tbl {any} -- 정렬할 배열.
	@param fn ((any, any)->boolean)? -- 비교 함수.
	@return {any} -- 정렬된 배열.
]=]
function TableUtil.sorted(tbl, fn)
	local ret = table.clone(tbl)
	sort(ret, fn)
	return ret
end

--[=[
	@within TableUtil
	@function slice
	배열에서 지정한 구간을 잘라 새 배열로 돌려줍니다.
	@param tbl {any} -- 대상 배열.
	@param start number? -- 시작 인덱스.
	@param stop number? -- 끝 인덱스.
	@param step number? -- 걸음.
	@return {any} -- 잘라낸 배열.
]=]
function TableUtil.slice(tbl, start, stop, step)
	local ret = {}
	for i = start or 1, stop or #tbl, step or 1 do
		insert(ret, tbl[i])
	end
	return ret
end

--[=[
	@within TableUtil
	@function findValue
	조건에 맞는 첫 번째 값을 반환합니다.
	@param tbl {[any]: any} -- 검색할 테이블.
	@param testFn (any, any)->boolean -- 필터 함수.
	@return any? -- 조건을 만족하는 값.
]=]
function TableUtil.findValue(tbl, testFn)
	for key, value in pairs(tbl) do
		if testFn(value, key) == true then
			return value
		end
	end
	return nil
end

--[=[
	@within TableUtil
	@function findIndex
	조건에 맞는 첫 번째 키를 반환합니다.
	@param tbl {[any]: any} -- 검색할 테이블.
	@param testFn (any, any)->boolean -- 필터 함수.
	@return any? -- 조건을 만족하는 키.
]=]
function TableUtil.findIndex(tbl, testFn)
	for key, value in pairs(tbl) do
		if testFn(value, key) == true then
			return key
		end
	end
	return nil
end

--[=[
	@within TableUtil
	@function filter
	조건에 맞는 항목만 모아 새 테이블을 만들습니다.
	@param tbl {[any]: any} -- 대상 테이블.
	@param filterFn (any, any)->boolean -- 필터 함수.
	@return {[any]: any} -- 필터링된 테이블.
]=]
function TableUtil.filter(tbl, filterFn)
	local ret = {}
	for key, value in pairs(tbl) do
		if filterFn(value, key) then
			ret[key] = value
		end
	end
	return ret
end

--[=[
	@within TableUtil
	@function map
	모든 값을 변환한 새 배열을 반환합니다.
	@param tbl {[any]: any} -- 대상 테이블.
	@param mapFn (any, any)->any -- 변환 함수.
	@return {any} -- 변환된 값 배열.
]=]
function TableUtil.map(tbl, mapFn)
	local ret = {}
	for key, value in pairs(tbl) do
		ret[key] = mapFn(value, key)
	end
	return ret
end

--[=[
	@within TableUtil
	@function every
	모든 값이 조건을 통과하는지 검사합니다.
	@param tbl {[any]: any} -- 점검할 테이블.
	@param testFn (any, any)->boolean -- 검사 함수.
	@return boolean -- 모두 통과하면 true.
]=]
function TableUtil.every(tbl, testFn)
	for key, value in pairs(tbl) do
		if testFn(value, key) == false then
			return false
		end
	end
	return true
end

--[=[
	@within TableUtil
	@function merge
	
	여러 테이블을 앞쪽부터 차례로 병합합니다.
	
	문자열과 숫자 키가 혼합된 테이블을 지원합니다.
	키가 숫자면 배열로 취급하여 순서대로 삽입합니다.
	키가 문자열이면 딕셔너리로 취급하여 뒤쪽 값으로 덮어씁니다.
	
	@param ... any -- 병합할 테이블들.
	@return {[any]: any} -- 병합된 테이블.
]=]
function TableUtil.merge(...: { [any]: any }?): { [any]: any }
	local ret = {}

	for _, t in { ... } do
		for k, v in t do
			if type(k) == "number" then
				insert(ret, v)
			else
				ret[k] = v
			end
		end
	end

	return ret
end

--[=[
	@within TableUtil
	@function mergeArray
	배열을 순서대로 이어 붙인 새 배열을 만듭니다.
	@param ... {any} -- 이어 붙일 배열들.
	@return {any} -- 병합된 배열.
]=]
function TableUtil.mergeArray(...)
	local ret = {}

	for _, t in { ... } do
		for i, v in t do
			insert(ret, v)
		end
	end

	return ret
end

--[=[
	@within TableUtil
	@function mergeDict
	사전형 테이블을 뒤쪽 값으로 덮어쓰며 병합합니다.
	@param ... {[any]: any} -- 병합할 딕셔너리.
	@return {[any]: any} -- 병합된 딕셔너리.
]=]
function TableUtil.mergeDict(...)
	local ret = {}

	for _, t in { ... } do
		for k, v in t do
			ret[k] = v
		end
	end

	return ret
end

--[=[
	@within TableUtil
	@function fill
	배열형 테이블의 구간을 동일한 값으로 채웁니다.
	@param tbl {any} -- 대상 배열.
	@param value any -- 채울 값.
	@param start number? -- 시작 위치.
	@param End number? -- 끝 위치.
	@return {any} -- 수정된 배열.
]=]
function TableUtil.fill(tbl, value, start, End)
	if TableUtil.isEmpty(tbl) then
		error("	bl` must not be empty!", 2)
	elseif TableUtil.isDict(tbl) then
		error("	bl` must be a array-like table!", 2)
	elseif start ~= nil and start <= 0 then
		error("`start` must be more than 0!", 2)
	elseif End ~= nil and End > #tbl then
		error("`End` must not exceed #tbl!", 2)
	end

	for i = start or 1, End or #tbl do
		tbl[i] = value
	end

	return tbl
end

--[=[
	@within TableUtil
	@function removeDupes
	배열에서 중복 값을 제거하고 순서를 유지합니다.
	@param tbl {any} -- 대상 배열.
	@return {any} -- 중복이 제거된 배열.
]=]
function TableUtil.removeDupes(tbl)
	if TableUtil.isEmpty(tbl) then
		error("	bl` must not be empty!", 2)
	elseif TableUtil.isDict(tbl) then
		error("	bl` must be a array-like table!", 2)
	end

	local hash = {}
	local ret = {}
	for _, v in ipairs(tbl) do
		if not hash[v] then
			insert(ret, v)
			hash[v] = true
		end
	end

	return ret
end

--[=[
	@within TableUtil
	@function deepFreeze
	테이블과 모든 하위 테이블을 재귀적으로 freeze 합니다.
	@param tbl {[any]: any} -- 동결할 테이블.
]=]
function TableUtil.deepFreeze(tbl)
	table.freeze(tbl)

	for k, v in pairs(tbl) do
		if typeof(v) == "table" then
			TableUtil.deepFreeze(v)
		end
	end

	return tbl
end

local function isEqual(x: any, y: any): boolean
	return x == y and (x ~= 0 or 1 / x == 1 / y) or x ~= x and y ~= y
end

--[=[
	@within TableUtil
	@function shallowEqual
	두 테이블의 얕은 동등성을 비교합니다.
	@param tbl1 {[any]: any} -- 비교 대상.
	@param tbl2 {[any]: any} -- 비교 대상.
	@return boolean -- 모든 키와 값이 같으면 true.
]=]
function TableUtil.shallowEqual(tbl1, tbl2)
	for key, value in tbl1 do
		if not isEqual(tbl2[key], value) then
			return false
		end
	end

	for key, value in tbl2 do
		if not isEqual(tbl1[key], value) then
			return false
		end
	end

	return true
end

--#region Bisect

local function defaultComparator(a, b): boolean
	return a < b
end

-- Binary Search Function
--[=[
	@within TableUtil
	@function binarySearch
	정렬된 배열에서 대상 값을 이진 탐색합니다.
	@param array {any} -- 정렬된 배열.
	@param target any -- 찾을 값.
	@param comparator ((any, any)->boolean)? -- 정렬 비교 함수.
	@return number? -- 찾은 위치 인덱스.
]=]
function TableUtil.binarySearch<item>(array: { item }, target: item, comparator: ((a: item, b: item) -> boolean)?): number?
	local comparator = comparator or defaultComparator
	local low, high = 1, #array
	while low <= high do
		local mid = (low + high) // 2
		if comparator(target, array[mid]) then
			high = mid - 1
		elseif comparator(array[mid], target) then
			low = mid + 1
		else
			return mid -- Found target
		end
	end
	return nil -- Not found
end

-- Bisect Left Function
--[=[
	@within TableUtil
	@function bisectLeft
	정렬된 배열에서 대상이 들어갈 가장 왼쪽 위치를 반환합니다.
	@param array {any} -- 정렬된 배열.
	@param target any -- 삽입 값.
	@param comparator ((any, any)->boolean)? -- 정렬 비교 함수.
	@return number -- 삽입 지점 인덱스.
]=]
function TableUtil.bisectLeft<item>(array: { item }, target: item, comparator: ((a: item, b: item) -> boolean)?): number
	local comparator = comparator or defaultComparator
	local low, high = 1, #array + 1
	while low < high do
		local mid = (low + high) // 2
		if not comparator(array[mid], target) then -- arr[mid] >= target
			high = mid
		else
			low = mid + 1
		end
	end
	return low
end

-- Bisect Right Function
--[=[
	@within TableUtil
	@function bisectRight
	정렬된 배열에서 대상이 들어갈 가장 오른쪽 위치를 반환합니다.
	@param array {any} -- 정렬된 배열.
	@param target any -- 삽입 값.
	@param comparator ((any, any)->boolean)? -- 정렬 비교 함수.
	@return number -- 삽입 지점 인덱스.
]=]
function TableUtil.bisectRight<item>(array: { item }, target: item, comparator: ((a: item, b: item) -> boolean)?): number
	local comparator = comparator or defaultComparator
	local low, high = 1, #array + 1
	while low < high do
		local mid = (low + high) // 2
		if comparator(target, array[mid]) then -- target < arr[mid]
			high = mid
		else
			low = mid + 1
		end
	end
	return low
end

--#region Others
-- Had to reference all of the built-ins due to Roblox's restrictions.

TableUtil.insert = insert
TableUtil.remove = remove
TableUtil.sort = sort
TableUtil.pack = pack
TableUtil.unpack = unpack
TableUtil.move = move
TableUtil.concat = concat

TableUtil.clear = clear
TableUtil.create = create
TableUtil.find = tfind

table.freeze(TableUtil)

return TableUtil
