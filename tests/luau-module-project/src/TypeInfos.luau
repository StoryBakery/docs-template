--!native

--[=[
	@class TypeInfos
    
	직렬화, 역직렬화, 검증에 사용하는 TypeInfo 정의를 관리합니다.
	각 TypeInfo 는 버퍼에 데이터를 안전하게 저장하는 방법을 설명합니다.
]=]

local ReplicatedInstanceId = require("../roblox_packages/ReplicatedInstanceId")
local TableUtil = require("../roblox_packages/TableUtil")

local POS_INF = math.huge
local NEG_INF = -POS_INF

local BINARY_POS_INF_F16 = 0b0111110000000000
local BINARY_NEG_INF_F16 = 0b1111110000000000
local BINARY_NAN_F16 = 0b0111110000000001

local TypeInfos = {}
local typeInfosByName = {}

--[=[
	@class TypeInfo
	단일 데이터 타입에 대한 메타데이터로 직렬화, 역직렬화, 검증 로직을 모두 포함합니다.
]=]
local TypeInfo = {}
TypeInfo.__index = TypeInfo
TypeInfo.__type = "TypeInfo"

--[=[
	@function TypeInfo.Serialize
	전달된 버퍼에 값을 직렬화합니다.
	@param buf buffer -- 데이터를 기록할 버퍼.
	@param offset number -- 기록을 시작할 바이트 오프셋.
	@param value any -- 직렬화할 값.
]=]
export type Serialize = (buf: buffer, offset: number, value: any) -> ()

--[=[
	@function TypeInfo.Deserialize
	전달된 버퍼에서 값을 역직렬화합니다.
	@param buf buffer -- 데이터를 읽어올 버퍼.
	@param offset number -- 읽기를 시작할 바이트 오프셋.
	@return any -- 복원된 값.
]=]
export type Deserialize = (buf: buffer, offset: number) -> any

--[=[
	@function TypeInfo.TypeCheck
	전달된 값이 이 TypeInfo 와 일치하는지 검증합니다.
	@param value any -- 검증할 값.
	@return boolean -- 유효하면 true.
]=]
export type TypeCheck = (value: any) -> boolean

--[=[
	@prop TypeInfo.StrictTypeCheck
	
	이 TypeInfo 에 대해 엄격한 타입 검사를 수행하는 함수입니다.
	기본 TypeCheck 와는 별개로, 더 엄격한 검사가 필요할 때 사용됩니다.
	
	성능 비용이 보다 크기에, TypeCheck 로만 사용하는 것을 권장합니다.
	StrictTypeCheck는 스튜디오[RunService:IsStudio]에서나, 
	런타임 도중 단 한번만 실행되는 매우 엄격한 검사가 필요한 경우에만 사용하세요.
	TypeCheck 도 성능 비용이 크기에, 과도 사용을 권장하지 않습니다.
	
	TypeCheck 는 완벽히 타입을 따르지않아도, 
	어떻게든 에러없이 Serialize/Deseiralize가 될 수 있다면 허용하는 반면 
	StrictTypeCheck 는 정확히 그 타입이어야만 허용하는 함수입니다.
	
	TypeCheck 예시: 
	uint32
	6.13 는 정확하게는 uint32 가 아님에도, Serialize 시 6 으로 에러없이 변환됨
	-150 는 정확하게는 uint32 가 아님에도, Serialize 시 4294967146 으로 에러없이 변환됨
	
	StrictTypeCheck 예시:
	uint32
	6.13 는 실수기에 허용되지 않음
	-150 는 음수기에 허용되지 않음
	
	기본적으로 TypeCheck 와 동일하게 설정됩니다.
	
	@param value any -- 검증할 값.
	@return boolean -- 유효하면 true
	@return string? -- 유효하지 않을 때의 원인, 유효하지 않을 때도 원인은 출력안될 수 있음
]=]
export type StrictTypeCheck = (value: any) -> (boolean, string?)

export type TypeInfo = setmetatable<{
	--[=[
		TypeInfo 의 이름입니다. 예: "float32", "Color3", "Instance".
	]=]
	Name: string,

	--[=[
		이 TypeInfo 에 부여된 내부 숫자 식별자입니다.
	]=]
	TypeId: number,

	--[=[?
		Roblox 엔진 타입에 대응하는 경우 사용하는 엔진 타입 식별자입니다.
	]=]
	RobloxTypeId: number?,

	--[=[?
		Enum 에 대응하는 경우 사용하는 Enum 식별자입니다.
	]=]
	EnumTypeId: number?,

	--[=[
		값이 주어지지 않았을 때 사용할 기본값입니다.
	]=]
	Default: any,

	--[=[
		Luau 타입 표기 문자열입니다. 예: "number", "Color3".
	]=]
	TypeAnnotation: string,

	--[=[
		고정 크기 타입이라면 여기에서 바이트 길이를 저장하고, 가변 크기 타입이라면 "Undefined" 로 두고 GetSize 를 사용합니다.
	]=]
	Size: number | "Undefined",
	GetSize: (value: any) -> number,

	Serialize: Serialize,
	Deserialize: Deserialize,
	TypeCheck: TypeCheck,
	StrictTypeCheck: StrictTypeCheck,

	--[=[
		이 타입이 Luau 에서 제공하는 기본 타입인지 여부를 나타냅니다.
	]=]
	IsLuauType: boolean,

	--[=[
		이 타입이 Roblox 엔진에서 제공하는 기본 타입인지 여부를 나타냅니다.
	]=]
	IsRobloxType: boolean,

	--[=[
		이 타입이 Enum 을 표현하는지 여부를 나타냅니다.
	]=]
	IsEnum: boolean,

	--[=[
		Instance 의 Attribute 에 값을 그대로 넣어도 가능한 타입인지 여부입니다.
	]=]
	IsAttributeCompatible: boolean,
}, typeof(TypeInfo)>

local any = {} :: any
local ATTRIBUTE_COMPATIBLE_TYPEOFS = table.freeze({
	boolean = true,
	number = true,
	string = true,
	Vector2 = true,
	Vector3 = true,
	Vector2int16 = true,
	Vector3int16 = true,
	UDim = true,
	UDim2 = true,
	Rect = true,
	CFrame = true,
	Color3 = true,
	ColorSequence = true,
	BrickColor = true,
	NumberRange = true,
	NumberSequence = true,
	PhysicalProperties = true,
})
local DATA_TYPE_PARAMS_TYPE = {
	Default = any :: any?,
	TypeAnnotation = any :: string?,

	Size = any :: number | "Undefined",
	GetSize = any :: ((value: any) -> number)?,

	Serialize = any :: Serialize,
	Deserialize = any :: Deserialize,
	TypeCheck = any :: TypeCheck | string?,
	StrictTypeCheck = any :: TypeCheck?,

	IsLuauType = any :: boolean?,
	IsRobloxType = any :: boolean?,
	IsEnum = any :: boolean?,
	IsAttributeCompatible = any :: boolean?,
}
type TypeInfoParams = typeof(DATA_TYPE_PARAMS_TYPE)

--[[
	새로운 **TypeInfo**를 정의해 **TypeInfos** 테이블에 등록하는 내부 함수입니다. 

	이 함수를 통해 `Serialize`, `Deserialize`, `Size`, `TypeCheck` 등 필요한 정보를 모두 설정하면,  
	해당 `TypeInfo` 객체가 `TypeInfos[name]` 에 보관되고, 이후 직렬화/역직렬화 시 사용됩니다.

	외부에서 사용할 수 없습니다.
]]
local function setTypeAnnotation(self: TypeInfo, paramTypeAnnotation: string?, default: any?)
	if paramTypeAnnotation == nil then
		self.TypeAnnotation = typeof(default)
	elseif typeof(paramTypeAnnotation) == "table" then
		self.TypeAnnotation = `"{table.concat(paramTypeAnnotation, `"|"`)}"`
	else
		self.TypeAnnotation = paramTypeAnnotation
	end
end

local function createTypeInfo(name: string, params: TypeInfoParams): TypeInfo
	assert(typeInfosByName[name] == nil, `TypeInfo "{name}" has already been declared.`)

	for key in params do
		if DATA_TYPE_PARAMS_TYPE[key] == nil then
			error(`"{key}" is invalid TypeInfoParams Key.`)
		end
	end

	local self = setmetatable({}, TypeInfo)

	self.Name = name

	if params.Default == nil and not (name == "Instance" or name == "nil") then
		error(`TypeInfo "{name}"'s Default is nil.`)
	end
	self.Default = params.Default

	self.Serialize = params.Serialize or error(`Missing Serialize Function for TypeInfo "{name}"`)
	self.Deserialize = params.Deserialize or error(`Missing Deserialize Function for TypeInfo "{name}"`)

	local size = params.Size
	if typeof(size) == "number" then
		self.Size = size

		if params.GetSize then
			error(`Cannot set GetSize for TypeInfo "{name}". It already has a defined size.`)
		end

		self.GetSize = function()
			return self.Size
		end
	elseif size == "Undefined" then
		self.Size = size

		self.GetSize = params.GetSize or error(`Missing GetSize Function for TypeInfo "{name}"`)
	else
		error(`TypeInfo "{name}" Size must be a number or 'Undefined'.`)
	end

	if params.TypeCheck == nil then
		self.TypeCheck = function(value)
			return typeof(value) == name
		end
	elseif typeof(params.TypeCheck) == "string" then
		local dataName = params.TypeCheck
		self.TypeCheck = function(value)
			return typeof(value) == dataName
		end
	else
		self.TypeCheck = params.TypeCheck
	end

	self.StrictTypeCheck = params.StrictTypeCheck or self.TypeCheck

	setTypeAnnotation(self, params.TypeAnnotation, params.Default)

	self.IsEnum = params.IsEnum or false
	self.IsLuauType = params.IsLuauType or false
	self.IsRobloxType = params.IsLuauType or params.IsRobloxType or false
	local isAttributeCompatible = params.IsAttributeCompatible
	if isAttributeCompatible == nil then
		local defaultValue = params.Default
		isAttributeCompatible = ATTRIBUTE_COMPATIBLE_TYPEOFS[typeof(defaultValue)] == true
	end
	self.IsAttributeCompatible = isAttributeCompatible

	typeInfosByName[name] = self
	TypeInfos[name] = self

	return self
end

--#region Type Declaration
--#tag typeInfosByName
typeInfosByName["boolean"] = createTypeInfo("boolean", {
	Default = false,
	IsLuauType = true,

	Size = 1,

	Serialize = function(b, offset, value)
		buffer.writeu8(b, offset, if value then 1 else 0)
	end,
	Deserialize = function(b, offset)
		return buffer.readu8(b, offset) == 1
	end,
})

--#tag string
typeInfosByName["string"] = createTypeInfo("string", {
	Default = "",
	IsLuauType = true,

	Size = "Undefined",
	GetSize = function(value: string)
		return #value + 2
	end,

	Serialize = function(b, offset, value)
		buffer.writeu16(b, offset, string.len(value))
		buffer.writestring(b, offset + 2, value)
	end,
	Deserialize = function(b, offset)
		local len = buffer.readu16(b, offset)
		return buffer.readstring(b, offset + 2, len)
	end,
})

--#tag number
typeInfosByName["number"] = createTypeInfo("number", {
	Default = 0,
	IsLuauType = true,

	Size = 8,

	Serialize = function(b, offset, value)
		buffer.writef64(b, offset, value)
	end,

	Deserialize = function(b, offset)
		return buffer.readf64(b, offset)
	end,
})

--#tag FloatList
typeInfosByName["FloatList"] = createTypeInfo("FloatList", {
	Default = {},

	Size = "Undefined",

	GetSize = function(value: { number })
		return 2 + #value * 8
	end,

	Serialize = function(b, offset, value: { number })
		local length = #value
		buffer.writeu16(b, offset, length)
		for i = 1, length do
			buffer.writef64(b, offset + 2 + (i - 1) * 8, value[i])
		end
	end,

	Deserialize = function(b, offset)
		local length = buffer.readu16(b, offset)
		local result = table.create(length)
		for i = 1, length do
			result[i] = buffer.readf64(b, offset + 2 + (i - 1) * 8)
		end
		return result
	end,

	TypeCheck = "table",
	StrictTypeCheck = function(value)
		if typeof(value) ~= "table" then
			return false, `Not a table, but received "{value}", "{typeof(value)}"`
		end

		if not TableUtil.isArray(value) then
			return false, "Not an array"
		end

		for index, v in ipairs(value) do
			if typeof(v) ~= "number" then
				return false, `Element "{v}" at index "{index}" is not a number`
			end
		end

		return true
	end,
	TypeAnnotation = "{number}",
})

--#tag float16
typeInfosByName["float16"] = createTypeInfo("float16", {
	Default = 0,

	Size = 2,

	Serialize = function(b, offset, value)
		if value == 0 then
			buffer.writeu16(b, offset, 0)
		elseif value == POS_INF then
			buffer.writeu16(b, offset, BINARY_POS_INF_F16)
		elseif value == NEG_INF then
			buffer.writeu16(b, offset, BINARY_NEG_INF_F16)
		elseif value ~= value then
			buffer.writeu16(b, offset, BINARY_NAN_F16)
		else
			local mantissa, exponent = math.frexp(math.abs(value))
			mantissa = math.round((mantissa - 0.5) * 2 ^ 11)
			exponent = math.clamp(exponent, -15, 16) + 15
			buffer.writeu16(b, offset, (value >= 0 and 0 or 2 ^ 15) + exponent * 2 ^ 10 + mantissa)
		end
	end,

	Deserialize = function(b, offset)
		local value = buffer.readu16(b, offset)

		if value == 0 then
			return 0
		elseif value == BINARY_POS_INF_F16 then
			return POS_INF
		elseif value == BINARY_NEG_INF_F16 then
			return NEG_INF
		elseif value == BINARY_NAN_F16 then
			return 0 / 0
		end

		local sign = bit32.band(value, 2 ^ 15) == 0 and 1 or -1
		local exponent = bit32.extract(value, 10, 5) - 15
		local mantissa = value % 2 ^ 10
		return sign * (mantissa / 2 ^ 10 * 0.5 + 0.5) * math.pow(2, exponent)
	end,
	TypeCheck = "number",
	TypeAnnotation = "number",
})

--#tag float32
typeInfosByName["float32"] = createTypeInfo("float32", {
	Default = 0,

	Size = 4,

	Serialize = function(b, offset, value)
		buffer.writef32(b, offset, value)
	end,

	Deserialize = function(b, offset)
		return buffer.readf32(b, offset)
	end,
	TypeCheck = "number",
	TypeAnnotation = "number",
})

--#tag integer

--#tag int8
typeInfosByName["int8"] = createTypeInfo("int8", {
	Default = 0,

	Size = 1,

	Serialize = function(b, offset, value)
		buffer.writei8(b, offset, value)
	end,
	Deserialize = function(b, offset)
		return buffer.readi8(b, offset)
	end,
	TypeCheck = "number",
	TypeAnnotation = "number",
})

--#tag int16
typeInfosByName["int16"] = createTypeInfo("int16", {
	Default = 0,

	Size = 2,

	Serialize = function(b, offset, value)
		buffer.writei16(b, offset, value)
	end,
	Deserialize = function(b, offset)
		return buffer.readi16(b, offset)
	end,
	TypeCheck = "number",
	TypeAnnotation = "number",
})
--#tag int32
typeInfosByName["int32"] = createTypeInfo("int32", {
	Default = 0,
	Size = 4, -- 32비트 정수이므로 4바이트

	Serialize = function(b, offset, value)
		buffer.writei32(b, offset, value)
	end,
	Deserialize = function(b, offset)
		return buffer.readi32(b, offset)
	end,

	TypeCheck = "number",
	TypeAnnotation = "number",
})

--#tag uint
--#tag uint8
typeInfosByName["uint8"] = createTypeInfo("uint8", {
	Default = 0,
	Size = 1, -- 8비트 부호 없는 정수이므로 1바이트

	Serialize = function(b, offset, value)
		buffer.writeu8(b, offset, value)
	end,
	Deserialize = function(b, offset)
		return buffer.readu8(b, offset)
	end,

	TypeCheck = "number",
	TypeAnnotation = "number",
})

--#tag uint16
typeInfosByName["uint16"] = createTypeInfo("uint16", {
	Default = 0,
	Size = 2, -- 16비트 부호 없는 정수이므로 2바이트

	Serialize = function(b, offset, value)
		buffer.writeu16(b, offset, value)
	end,
	Deserialize = function(b, offset)
		return buffer.readu16(b, offset)
	end,

	TypeCheck = "number",
	TypeAnnotation = "number",
})

--#tag uint32
typeInfosByName["uint32"] = createTypeInfo("uint32", {
	Default = 0,
	Size = 4, -- 32비트 부호 없는 정수이므로 4바이트

	Serialize = function(b, offset, value)
		buffer.writeu32(b, offset, value)
	end,
	Deserialize = function(b, offset)
		return buffer.readu32(b, offset)
	end,

	TypeCheck = "number",
	TypeAnnotation = "number",
})

--#tag Vector3
typeInfosByName["Vector3"] = createTypeInfo("Vector3", {
	Default = Vector3.zero,
	IsRobloxType = true,
	Size = 12, -- float32 3개(x,y,z)이므로 12바이트 (4*3)

	Serialize = function(b, offset, value)
		buffer.writef32(b, offset, value.X)
		buffer.writef32(b, offset + 4, value.Y)
		buffer.writef32(b, offset + 8, value.Z)
	end,
	Deserialize = function(b, offset)
		local x = buffer.readf32(b, offset)
		local y = buffer.readf32(b, offset + 4)
		local z = buffer.readf32(b, offset + 8)
		return Vector3.new(x, y, z)
	end,
})

--#tag Color3
typeInfosByName["Color3"] = createTypeInfo("Color3", {
	Default = Color3.fromRGB(255, 255, 255),
	IsRobloxType = true,
	Size = 12, -- float32(R,G,B) 3개 = 12바이트

	Serialize = function(b, offset, value)
		buffer.writef32(b, offset, value.R)
		buffer.writef32(b, offset + 4, value.G)
		buffer.writef32(b, offset + 8, value.B)
	end,
	Deserialize = function(b, offset)
		local r = buffer.readf32(b, offset)
		local g = buffer.readf32(b, offset + 4)
		local b_ = buffer.readf32(b, offset + 8)
		return Color3.new(r, g, b_)
	end,
})

--#tag Color3uint8
typeInfosByName["Color3uint8"] = createTypeInfo("Color3uint8", {
	Default = Color3.fromRGB(255, 255, 255),
	Size = 3, -- R,G,B 각각 1바이트(0~255)

	Serialize = function(b, offset, value: Color3)
		-- 0~1 범위인 value.R,G,B를 0~255 정수로 변환해서 저장
		buffer.writeu8(b, offset, math.floor(value.R * 255 + 0.5))
		buffer.writeu8(b, offset + 1, math.floor(value.G * 255 + 0.5))
		buffer.writeu8(b, offset + 2, math.floor(value.B * 255 + 0.5))
	end,
	Deserialize = function(b, offset)
		return Color3.fromRGB(buffer.readu8(b, offset), buffer.readu8(b, offset + 1), buffer.readu8(b, offset + 2))
	end,

	TypeCheck = "Color3",
	TypeAnnotation = "Color3",
})

--#tag NumberSequence
typeInfosByName["NumberSequence"] = createTypeInfo("NumberSequence", {
	Default = NumberSequence.new(0),
	IsRobloxType = true,
	Size = "Undefined", -- 키포인트 개수에 따라 달라짐
	GetSize = function(value: NumberSequence)
		local count = #value.Keypoints
		return 1 + count * 12 -- 1byte(count) + 12byte(keypoint) * count
	end,

	Serialize = function(b, offset, value)
		local keypoints = value.Keypoints
		local count = #keypoints

		buffer.writeu8(b, offset, count)
		offset += 1
		for i = 1, count do
			local kp = keypoints[i]
			buffer.writef32(b, offset, kp.Time)
			buffer.writef32(b, offset + 4, kp.Value)
			buffer.writef32(b, offset + 8, kp.Envelope)
			offset = offset + 12
		end
	end,
	Deserialize = function(b, offset)
		local count = buffer.readu8(b, offset)
		offset += 1

		local keypoints = {}
		for i = 1, count do
			local time = buffer.readf32(b, offset)
			local value = buffer.readf32(b, offset + 4)
			local envelope = buffer.readf32(b, offset + 8)
			keypoints[i] = NumberSequenceKeypoint.new(time, value, envelope)
			offset = offset + 12
		end
		return NumberSequence.new(keypoints)
	end,
})

--#tag ColorSequence
typeInfosByName["ColorSequence"] = createTypeInfo("ColorSequence", {
	Default = ColorSequence.new(Color3.new(1, 1, 1)),
	IsRobloxType = true,
	Size = "Undefined", -- 마찬가지로 키포인트 개수에 따라 달라짐
	GetSize = function(value: ColorSequence)
		local count = #value.Keypoints
		return 1 + count * 7 -- 1byte(count) + 7byte(keypoint) * count
	end,

	Serialize = function(b, offset, value)
		local keypoints = value.Keypoints
		local count = #keypoints

		buffer.writeu8(b, offset, count)
		offset += 1

		for _, kp in ipairs(keypoints) do
			buffer.writef32(b, offset, kp.Time)
			local r = math.floor(kp.Value.R * 255 + 0.5)
			local g = math.floor(kp.Value.G * 255 + 0.5)
			local b_ = math.floor(kp.Value.B * 255 + 0.5)
			buffer.writeu8(b, offset + 4, r)
			buffer.writeu8(b, offset + 5, g)
			buffer.writeu8(b, offset + 6, b_)
			offset = offset + 7
		end
	end,
	Deserialize = function(b, offset)
		local count = buffer.readu8(b, offset)
		offset = offset + 1

		local keypoints = {}
		for i = 1, count do
			local time = buffer.readf32(b, offset)
			local r = buffer.readu8(b, offset + 4)
			local g = buffer.readu8(b, offset + 5)
			local b_ = buffer.readu8(b, offset + 6)
			keypoints[i] = ColorSequenceKeypoint.new(time, Color3.fromRGB(r, g, b_))
			offset = offset + 7
		end
		return ColorSequence.new(keypoints)
	end,
})

--#tag NumberRange
typeInfosByName["NumberRange"] = createTypeInfo("NumberRange", {
	Default = NumberRange.new(0),
	IsRobloxType = true,
	Size = 8, -- float32 2개 = 8바이트

	Serialize = function(b, offset, value)
		buffer.writef32(b, offset, value.Min)
		buffer.writef32(b, offset + 4, value.Max)
	end,
	Deserialize = function(b, offset)
		local min = buffer.readf32(b, offset)
		local max = buffer.readf32(b, offset + 4)
		return NumberRange.new(min, max)
	end,
})

--#tag Vector2
typeInfosByName["Vector2"] = createTypeInfo("Vector2", {
	Default = Vector2.zero,
	IsRobloxType = true,
	Size = 8, -- float32 2개 = 8바이트

	Serialize = function(b, offset, value)
		buffer.writef32(b, offset, value.X)
		buffer.writef32(b, offset + 4, value.Y)
	end,
	Deserialize = function(b, offset)
		local x = buffer.readf32(b, offset)
		local y = buffer.readf32(b, offset + 4)
		return Vector2.new(x, y)
	end,
})

--#tag UDim
typeInfosByName["UDim"] = createTypeInfo("UDim", {
	Default = UDim.new(),
	IsRobloxType = true,
	Size = 8, -- float32 1개 + int32 1개 = 8바이트

	Serialize = function(b, offset, value)
		buffer.writef32(b, offset, value.Scale)
		buffer.writei32(b, offset + 4, value.Offset)
	end,
	Deserialize = function(b, offset)
		local scale = buffer.readf32(b, offset)
		local offset_ = buffer.readi32(b, offset + 4)
		return UDim.new(scale, offset_)
	end,
})

--#tag UDim2
typeInfosByName["UDim2"] = createTypeInfo("UDim2", {
	Default = UDim2.new(),
	IsRobloxType = true,
	Size = 16, -- (float32+int32) * 2 = 16바이트

	Serialize = function(b, offset, value)
		buffer.writef32(b, offset, value.X.Scale)
		buffer.writei32(b, offset + 4, value.X.Offset)
		buffer.writef32(b, offset + 8, value.Y.Scale)
		buffer.writei32(b, offset + 12, value.Y.Offset)
	end,
	Deserialize = function(b, offset)
		local xScale = buffer.readf32(b, offset)
		local xOffset = buffer.readi32(b, offset + 4)
		local yScale = buffer.readf32(b, offset + 8)
		local yOffset = buffer.readi32(b, offset + 12)
		return UDim2.new(xScale, xOffset, yScale, yOffset)
	end,
})

--#tag CFrame
do
	local I16_PRECISION = 32767 -- int16 범위 내에서 쿼터니언 xyz를 압축하기 위한 상수

	local function quaternionVector3FromCFrame(cf: CFrame)
		-- 축/각도로부터 quaternion을 구하고,
		-- w 제외 x,y,z에 sin(각도/2)을 곱한 벡터를 반환하는 예시
		local axis, angle = cf:ToAxisAngle()
		local half = math.sin(angle / 2)
		return axis * half
	end

	local alignedCFrameSet = {
		[CFrame.Angles(0, 0, 0)] = 1,
		[CFrame.Angles(math.rad(90), 0, 0)] = 1,
		[CFrame.Angles(0, math.rad(180), math.rad(180))] = 1,
		[CFrame.Angles(math.rad(-90), 0, 0)] = 1,
		[CFrame.Angles(0, math.rad(180), math.rad(90))] = 1,
		[CFrame.Angles(0, math.rad(90), math.rad(90))] = 1,
		[CFrame.Angles(0, 0, math.rad(90))] = 1,
		[CFrame.Angles(0, math.rad(-90), math.rad(90))] = 1,
		[CFrame.Angles(math.rad(-90), math.rad(-90), 0)] = 1,
		[CFrame.Angles(0, math.rad(-90), 0)] = 1,
		[CFrame.Angles(math.rad(90), math.rad(-90), 0)] = 1,
		[CFrame.Angles(0, math.rad(90), math.rad(180))] = 1,
		[CFrame.Angles(0, math.rad(-90), math.rad(180))] = 1,
		[CFrame.Angles(0, math.rad(180), math.rad(0))] = 1,
		[CFrame.Angles(math.rad(-90), math.rad(-180), math.rad(0))] = 1,
		[CFrame.Angles(0, math.rad(0), math.rad(180))] = 1,
		[CFrame.Angles(math.rad(90), math.rad(180), math.rad(0))] = 1,
		[CFrame.Angles(0, math.rad(0), math.rad(-90))] = 1,
		[CFrame.Angles(0, math.rad(-90), math.rad(-90))] = 1,
		[CFrame.Angles(0, math.rad(-180), math.rad(-90))] = 1,
		[CFrame.Angles(0, math.rad(90), math.rad(-90))] = 1,
		[CFrame.Angles(math.rad(90), math.rad(90), 0)] = 1,
		[CFrame.Angles(0, math.rad(90), 0)] = 1,
		[CFrame.Angles(math.rad(-90), math.rad(90), 0)] = 1,
	}

	local function serializeCFrame(b: buffer, offset: number, value: CFrame)
		buffer.writef32(b, offset, value.X)
		buffer.writef32(b, offset + 4, value.Y)
		buffer.writef32(b, offset + 8, value.Z)

		-- 회전 ( int16 3개 ) = quaternion의 x,y,z만 저장
		local qVector = quaternionVector3FromCFrame(value)
		local qx = math.floor(qVector.X * I16_PRECISION + 0.5)
		local qy = math.floor(qVector.Y * I16_PRECISION + 0.5)
		local qz = math.floor(qVector.Z * I16_PRECISION + 0.5)

		buffer.writei16(b, offset + 12, qx)
		buffer.writei16(b, offset + 14, qy)
		buffer.writei16(b, offset + 16, qz)
	end

	local function deserializeCFrame(b: buffer, offset: number): CFrame
		local x = buffer.readf32(b, offset)
		local y = buffer.readf32(b, offset + 4)
		local z = buffer.readf32(b, offset + 8)

		local qx = buffer.readi16(b, offset + 13) / I16_PRECISION
		local qy = buffer.readi16(b, offset + 15) / I16_PRECISION
		local qz = buffer.readi16(b, offset + 17) / I16_PRECISION

		-- w = sqrt(1 - x^2 - y^2 - z^2)
		local qw = math.sqrt(1 - (qx ^ 2 + qy ^ 2 + qz ^ 2))
		return CFrame.new(x, y, z, qx, qy, qz, qw)
	end

	typeInfosByName["CFrame"] = createTypeInfo("CFrame", {
		Default = CFrame.identity,
		IsRobloxType = true,
		-- 정렬: float32 * 3 + 1= 12 + 1 = 13
		-- 비정렬: float32 * 3 + int16 * 3 + 1= 12 + 6  + 1= 19
		Size = "Undefined",
		GetSize = function(value)
			return if alignedCFrameSet[value] then 13 else 19
		end,

		Serialize = function(b, offset, value)
			if alignedCFrameSet[value] then
				buffer.writeu8(b, offset, 1)
				buffer.writef32(b, offset + 1, value.X)
				buffer.writef32(b, offset + 5, value.Y)
				buffer.writef32(b, offset + 9, value.Z)
				return
			end

			buffer.writeu8(b, offset, 0)
			serializeCFrame(b, offset + 1, value)
		end,
		Deserialize = function(b, offset)
			local isAligned = buffer.readu8(b, offset) == 1
			if isAligned then
				local x = buffer.readf32(b, offset + 1)
				local y = buffer.readf32(b, offset + 5)
				local z = buffer.readf32(b, offset + 9)
				return CFrame.new(x, y, z)
			end

			return deserializeCFrame(b, offset + 1)
		end,
	})

	--#tag CFrameList
	typeInfosByName["CFrameList"] = createTypeInfo("CFrameList", {
		Default = {},
		TypeAnnotation = "{CFrame}",
		Size = "Undefined",
		GetSize = function(value: { CFrame })
			return 2 + #value * 18
		end,
		Serialize = function(b, offset, value: { CFrame })
			local length = #value
			buffer.writeu16(b, offset, length)
			for i = 1, length do
				serializeCFrame(b, offset + 2 + 18 * (i - 1), value[i])
			end
		end,
		Deserialize = function(b, offset)
			local length = buffer.readu16(b, offset)
			local t = {}
			for i = 1, length do
				t[i] = deserializeCFrame(b, offset + 2 + 18 * (i - 1))
			end
			return t
		end,
	})
end

--#tag Font
typeInfosByName["Font"] = createTypeInfo("Font", {
	Default = Enum.Font.Arial,
	IsRobloxType = true,
	Size = "Undefined", -- Family 문자열 길이에 따라 달라짐 + Weight/Style 비트
	GetSize = function(value: Font)
		return 4 + #value.Family
	end,

	Serialize = function(b, offset, value: Font)
		buffer.writeu16(b, offset, #value.Family)
		buffer.writestring(b, offset + 2, value.Family)

		offset += 2 + #value.Family
		buffer.writeu8(b, offset, value.Weight.Value - 1)
		buffer.writeu8(b, offset + 1, value.Style.Value - 1)
	end,
	Deserialize = function(b, offset)
		local len = buffer.readu16(b, offset)
		local family = buffer.readstring(b, offset + 2, len)

		offset += 2 + len
		local weightVal = buffer.readu8(b, offset)
		local styleVal = buffer.readu8(b, offset + 1)

		local fontWeight = Enum.FontWeight:GetEnumItems()[weightVal + 1]
		local fontStyle = Enum.FontStyle:GetEnumItems()[styleVal + 1]

		return Font.new(family, fontWeight, fontStyle)
	end,
})

--#tag Instance
typeInfosByName["Instance"] = createTypeInfo("Instance", {
	Default = nil,
	IsRobloxType = true,
	Size = 4,

	Serialize = function(b, offset, value: Instance?)
		if value then
			buffer.writeu32(b, offset, ReplicatedInstanceId.FindOrAssignId(value))
		else
			buffer.writeu32(b, offset, 0)
		end
	end,
	Deserialize = function(b, offset)
		local id = buffer.readu32(b, offset)
		if id == 0 then
			return nil
		end

		return ReplicatedInstanceId.FindInstanceFromId(id)
	end,

	TypeCheck = function(value)
		return typeof(value) == "Instance" or value == nil
	end,
})

--#tag nil
typeInfosByName["nil"] = createTypeInfo("nil", {
	Default = nil,
	IsLuauType = true,
	Size = 0,
	Serialize = function(b, offset, value) end,
	Deserialize = function(b, offset)
		return nil
	end,
})

--#tag table
do
	local function calculateTableElementSize(key: any, value: any): number
		local keyInfo = TypeInfos.GetTypeInfoByValueType(key)
		local valueInfo = TypeInfos.GetTypeInfoByValueType(value)
		return 2 + keyInfo.GetSize(key) + 2 + valueInfo.GetSize(value)
	end

	typeInfosByName["table"] = createTypeInfo("table", {
		Default = {},
		IsLuauType = true,
		Size = "Undefined",
		GetSize = function(value)
			local totalSize = 4 -- 요소 개수를 위한 uint32
			for k, v in value do
				totalSize += calculateTableElementSize(k, v)
			end
			return totalSize
		end,
		Serialize = function(b, offset, value: { any })
			local count = 0
			for _ in value do
				count += 1
			end

			-- 요소 개수 쓰기
			buffer.writeu32(b, offset, count)
			local currentOffset = offset + 4

			-- 각 키-값 쌍 쓰기
			for key, value in pairs(value) do
				local keyInfo = TypeInfos.GetTypeInfoByValueType(key) :: TypeInfo
				local valueInfo = TypeInfos.GetTypeInfoByValueType(value) :: TypeInfo

				-- 키 타입 ID 쓰기
				buffer.writeu16(b, currentOffset, keyInfo.TypeId)
				currentOffset += 2

				-- 키 데이터 쓰기
				keyInfo.Serialize(b, currentOffset, key)
				currentOffset += keyInfo.GetSize(key)

				-- 값 타입 ID 쓰기
				buffer.writeu16(b, currentOffset, valueInfo.TypeId)
				currentOffset += 2

				-- 값 데이터 쓰기
				valueInfo.Serialize(b, currentOffset, value)
				currentOffset += valueInfo.GetSize(value)
			end
		end,
		Deserialize = function(b, offset)
			local count = buffer.readu32(b, offset)
			local currentOffset = offset + 4
			local newTable = {}

			for _ = 1, count do
				-- 키 타입 ID 읽기
				local keyTypeId = buffer.readu16(b, currentOffset)
				local keyInfo = TypeInfos.GetTypeInfoByTypeId(keyTypeId)
				currentOffset += 2

				-- 키 데이터 읽기
				local key = keyInfo.Deserialize(b, currentOffset)
				local keySize = keyInfo.GetSize(key)
				currentOffset += keySize

				-- 값 타입 ID 읽기
				local valueTypeId = buffer.readu16(b, currentOffset)
				local valueInfo = TypeInfos.GetTypeInfoByTypeId(valueTypeId)
				currentOffset += 2

				-- 값 데이터 읽기
				local value = valueInfo.Deserialize(b, currentOffset)
				local valueSize = valueInfo.GetSize(value)
				currentOffset += valueSize

				newTable[key] = value
			end
			return newTable
		end,
	})
end

--#tag RobloxEnumItem
do
	local robloxEnumIdsByEnum = {}
	local robloxEnumsById = {}
	local robloxEnumItemIdsByEnum = {}
	local robloxEnumItemsByEnumAndId = {}

	for i, enum in Enum:GetEnums() do
		robloxEnumIdsByEnum[enum] = i
		robloxEnumsById[i] = enum

		robloxEnumItemsByEnumAndId[enum] = {}
		for i, enumItem in enum:GetEnumItems() do
			robloxEnumItemIdsByEnum[enumItem] = i
			robloxEnumItemsByEnumAndId[enum][i] = enumItem
		end
	end

	typeInfosByName["EnumItem"] = createTypeInfo("EnumItem", {
		Default = Enum.KeyCode.X,
		IsEnum = true,
		IsRobloxType = true,
		Size = 4,
		Serialize = function(b, offset, value: EnumItem)
			buffer.writeu16(b, offset, robloxEnumIdsByEnum[value.EnumType])
			buffer.writeu16(b, offset + 2, robloxEnumItemIdsByEnum[value])
		end,
		Deserialize = function(b, offset)
			local enum = robloxEnumsById[buffer.readu16(b, offset)]
			return robloxEnumItemsByEnumAndId[enum][buffer.readu16(b, offset + 2)]
		end,
	})
end

--#tag CustomEnum
do
	local function resolveCustomEnumId(value)
		if typeof(value) ~= "table" then
			error(`CustomEnum must be a table, got "{typeof(value)}".`)
		end

		local id
		local getEnumId = value.GetEnumId
		if typeof(getEnumId) == "function" then
			id = getEnumId(value)
		else
			id = value.Id
		end

		if typeof(id) ~= "number" then
			error(`CustomEnum.Id must be a number.`)
		end
		return id
	end

	local function resolveCustomEnumItemIds(value)
		if typeof(value) ~= "table" then
			error(`CustomEnumItem must be a table, got "{typeof(value)}".`)
		end

		local enumId
		local itemId

		local getEnumId = value.GetEnumId
		if typeof(getEnumId) == "function" then
			enumId = getEnumId(value)
		else
			enumId = value.EnumId
		end

		local getItemId = value.GetItemId
		if typeof(getItemId) == "function" then
			itemId = getItemId(value)
		else
			itemId = value.ItemId
		end

		if typeof(enumId) ~= "number" then
			error(`CustomEnumItem.EnumId must be a number.`)
		end
		if typeof(itemId) ~= "number" then
			error(`CustomEnumItem.ItemId must be a number.`)
		end

		return enumId, itemId
	end

	typeInfosByName["CustomEnum"] = createTypeInfo("CustomEnum", {
		Default = { Id = 0 },
		IsEnum = true,
		Size = 2,
		Serialize = function(b, offset, value)
			buffer.writeu16(b, offset, resolveCustomEnumId(value))
		end,
		Deserialize = function(b, offset)
			return { Id = buffer.readu16(b, offset) }
		end,
		TypeCheck = function(value)
			if typeof(value) ~= "table" then
				return false
			end
			if typeof(value.GetEnumId) == "function" then
				return true
			end
			return typeof(value.Id) == "number"
		end,
		TypeAnnotation = "CustomEnum",
	})

	typeInfosByName["CustomEnumItem"] = createTypeInfo("CustomEnumItem", {
		Default = { EnumId = 0, ItemId = 0 },
		IsEnum = true,
		Size = 4,
		Serialize = function(b, offset, value)
			local enumId, itemId = resolveCustomEnumItemIds(value)
			buffer.writeu16(b, offset, enumId)
			buffer.writeu16(b, offset + 2, itemId)
		end,
		Deserialize = function(b, offset)
			return {
				EnumId = buffer.readu16(b, offset),
				ItemId = buffer.readu16(b, offset + 2),
			}
		end,
		TypeCheck = function(value)
			if typeof(value) ~= "table" then
				return false
			end

			local hasEnumId = typeof(value.GetEnumId) == "function" or typeof(value.EnumId) == "number"
			local hasItemId = typeof(value.GetItemId) == "function" or typeof(value.ItemId) == "number"
			return hasEnumId and hasItemId
		end,
		TypeAnnotation = "CustomEnumItem",
	})
end

--#region Others

--#endregion Others
--#endregion Type Declaration

type TypeInfosByName = typeof(typeInfosByName)

export type TypeName = keyof<typeof(typeInfosByName)>

--#region Functions
do
	--#region Sorting
	local typeInfosById = {}
	for typeInfo, info in typeInfosByName do
		table.insert(typeInfosById, info)
	end
	table.sort(typeInfosById, function(a, b)
		return a.Name < b.Name
	end)
	for i, info in typeInfosById do
		info.TypeId = i
	end

	function TypeInfos.GetTypeInfos(): { TypeInfo }
		return typeInfosById
	end

	function TypeInfos.GetTypeInfoByTypeId(id: number): TypeInfo
		return typeInfosById[id] or error(`Invalid TypeInfo Id "{id}".`)
	end
	--#endregion
end

function TypeInfos.GetTypeInfosByName(): TypeInfosByName
	return typeInfosByName
end

function TypeInfos.GetTypeInfoByTypeName(name: string): TypeInfo
	return typeInfosByName[name] or error(`Invalid Type "{name}", which is not a supported type.`)
end

function TypeInfos.FindTypeInfoByValueType(value: any): TypeInfo?
	return typeInfosByName[typeof(value)]
end

function TypeInfos.GetTypeInfoByValueType(value: any): TypeInfo
	return TypeInfos.FindTypeInfoByValueType(value)
		or error(`Invalid Value "{value}", Type "{typeof(value)}" which is not a supported type.`)
end

return table.freeze(TypeInfos)
