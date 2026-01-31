--[=[
	@class DataObjectTypeInfos
	@extends TypeInfos
	
	[TypeInfos]( 기반으로 추가적인 클래스 타입과 인스턴스를 정의합니다.
	[ObjectClass]의 [PropertyInfo] 정의와, [ExtendedInstance] 와 [DataObject] 에서 사용합니다.
	
	[TypeInfos] 의 타입이나 정보 속성들을 거의 공유하지만,
	[DataObject] 의 저장에 쓰이는 것을 목적으로 하기에,
	인스턴스를 직렬화/역직렬화할 때 [ReplicatedInstanceId] 를 사용하는 것이 아니라,
	[DataObject] 를 사용합니다.
	
	[TypeInfos] 의 타입들은 서버 - 클라이언트 간의 통신에 맞춰져있지만,
	[DataObjectTypeInfos] 는 
	데이터 스토어 저장이나, 
	게임이 종료된 상태에서 보존하는 것, 
	`Instance` 속성에서 [ObjectClass]에서 정의된 클래스 구분에 맞춰져있습니다.
	예시로 `ExtCharacter.Instance` 만 받는 속성이 필요할 수 있는데, 구분하려면 [DataObjectTypeInfos] 를 사용해야합니다.
	
	특정 클래스의 인스턴스 타입 정보를 얻으려면 `DataObjectTypeInfos[ClassName]` 을 하면 얻을 수 있습니다.
	추상 클래스 또한 타입 정보 정의됩니다.
]=]

local TableUtil = require("../roblox_packages/TableUtil")
local TypeInfos = require("../roblox_packages/TypeInfos")

local ClassInfos = require("./ClassInfos")

--[=[ 
	@function GetSize
	@within DataObjectTypeInfo

	`Size`가 `"Undefined"`일 때, 실제 직렬화 크기를 결정하는 함수입니다.  
	예: `string` 은 문자열 길이에 따라 달라지므로 `#value + 2` 같은 식으로 계산할 수 있습니다.

	`Size` 가 고정되어있다면, 해당 `Size` 를 반환합니다. 


	@param value any
	@return number
]=]

--[=[ 
	@function Serialize
	@within DataObjectTypeInfo
	
	해당 타입 값을 **직렬화**하여 `buf`(바이트 버퍼)에 기록합니다.  
	`offset`은 기록 위치이며, 함수 내부에서 `buffer.write(...)` 식으로 원하는 포맷을 씁니다. 
]=]
export type Serialize = (buf: buffer, offset: number, value: any) -> ()

--[=[ 
	@function Deserialize
	@within DataObjectTypeInfo

	`buf`에서 `offset` 위치부터 필요한 바이트를 읽어, 이 데이터 타입에 맞는 로블록스/루아 값으로 **복원**합니다. 
]=]
export type Deserialize = (buf: buffer, offset: number, dataObject: any) -> any

--[=[ 
	@function TypeCheck 
	@within DataObjectTypeInfo

	값이 이 타입에 부합하는지 검사합니다. 
	
	@param value any
	@return boolean
]=]
export type TypeCheck = (value: any) -> boolean

export type DataObjectTypeCheck = (value: any) -> boolean

--\TypeName
export type DataObjectTypeName = string
--\DataObjectTypeInfosByName
type DataObjectTypeInfosByName = { [string]: DataObjectTypeInfo }
--\

local DataObjectTypeInfos = {}

--[=[
	@class DataObjectTypeInfo
	@extends TypeInfo
	
	특정 데이터 타입의 직렬화 정보와 메타데이터를 정의하는 클래스입니다.
	`DataObjectTypeInfos`에서 관리되며, `DataObject`의 데이터를 바이트 버퍼로 변환하거나 복원할 때 필요한 로직과 타입 검증 기능을 제공합니다.
]=]
local DataObjectTypeInfo = {}
DataObjectTypeInfo.__index = DataObjectTypeInfo
DataObjectTypeInfo.__type = "DataObjectTypeInfo"

export type DataObjectTypeInfo = setmetatable<{
	--[=[
		이 `TypeInfo`의 이름입니다.
	]=]
	Name: string,

	--[=[
		내부에서 자동 할당되는 정수 Id입니다. 
		알파벳순으로 정렬 후 인덱스 순으로 부여됩니다.
	]=]
	TypeId: number,

	--[=[
		값이 주어지지 않았을 때 사용하는 기본값입니다.
	]=]
	Default: any,

	--[=[
		Luau 타입 주석
		
		`"number"`, `"Color3"` 등.  
		
		Luau 자동완성에 사용됩니다.
	]=]
	TypeAnnotation: string,

	--[=[
		직렬화할 때 고정 크기
		단위는 바이트. 
		
		만약 고정 크기가 없으면 `"Undefined"`로 두며, 이 경우 GetSize 함수를 호출해서 크기를 구해야합니다.
		
		정해진 바이트 수를 갖는 타입(예: int32 → 4바이트, Color3 → 3바이트)은 `number`로 명시하고, 문자열 또는 시퀀스처럼 길이에 따라 달라지는 타입은 `"Undefined"`를 표기하여 **동적 크기**임을 나타냅니다.
	]=]
	Size: number | "Undefined",
	GetSize: (value: any) -> number?,

	Serialize: Serialize,
	Deserialize: Deserialize,
	TypeCheck: TypeCheck,
	DataObjectTypeCheck: DataObjectTypeCheck,

	--[=[
		`Enum` 타입인지 여부를 나타냅니다.
		`true`이면 내부적으로도 `Enum`에 대응하는 직렬화/역직렬화 로직이 포함됩니다. 
	]=]
	IsEnum: boolean,

	--[=[
		`Instance` 타입인지 여부를 나타냅니다.
		[DataObjectTypeInfos] 는 [ClassInfos] 에서 정의된 클래스들도 포함하고, `iteration` 을 돌리는 경우, 인스턴스는 특별 취급해야할 때 유용합니다.
	]=]
	IsInstance: boolean,
}, typeof(DataObjectTypeInfo)>

local any = {} :: any
local EXTENDED_DATA_TYPE_PARAMS_TYPE = {
	Default = any :: any?,
	TypeAnnotation = any :: string?,

	Size = any :: number | "Undefined",
	GetSize = any :: ((value: any) -> number)?,

	Serialize = any :: Serialize,
	Deserialize = any :: Deserialize,
	TypeCheck = any :: TypeCheck | string?,
	DataObjectTypeCheck = any :: DataObjectTypeCheck?,

	IsEnum = any :: boolean?,
	IsInstance = any :: boolean?,
}
type DataObjectTypeInfoParams = typeof(EXTENDED_DATA_TYPE_PARAMS_TYPE)

local function setTypeAnnotation(self: DataObjectTypeInfo, paramTypeAnnotation: string?, default: any?)
	if paramTypeAnnotation == nil then
		self.TypeAnnotation = typeof(default)
	elseif typeof(paramTypeAnnotation) == "table" then
		self.TypeAnnotation = `"{table.concat(paramTypeAnnotation, `"|"`)}"`
	else
		self.TypeAnnotation = paramTypeAnnotation
	end
end

local typeInfosByName = {}

local function createDataObjectTypeInfo(name: string, params: DataObjectTypeInfoParams): DataObjectTypeInfo
	assert(DataObjectTypeInfos[name] == nil, `DataObjectTypeInfo "{name}" has already been declared.`)

	for key in params do
		if EXTENDED_DATA_TYPE_PARAMS_TYPE[key] == nil then
			error(`The key "{key}" is not a valid DataObjectTypeInfoParams key.`)
		end
	end

	local self = setmetatable({}, DataObjectTypeInfo)

	self.Name = name
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

	self.DataObjectTypeCheck = params.DataObjectTypeCheck or self.TypeCheck

	setTypeAnnotation(self, params.TypeAnnotation, params.Default)

	self.IsEnum = params.IsEnum or false
	self.IsInstance = params.IsInstance or false

	typeInfosByName[name] = self
	DataObjectTypeInfos[name] = self

	return self
end

--[=[
	The instance is saved using the object ID.
	0 is nil
]=]
local DEFUALT_INSTANCE_DATA_TYPE_PARAMS = {
	Default = nil,
	TypeAnnotation = "Instance",

	Size = 4,

	Serialize = function(b: buffer, offset: number, instance: Instance)
		if instance then
			local DataObject = require("@DataObject") :: any
			local valueDataObject = DataObject.fromInstance(instance)
			local id = valueDataObject:GetObjectId()
			buffer.writeu32(b, offset, id)
		else
			buffer.writeu32(b, offset, 0)
		end
	end,
	Deserialize = function(b: buffer, offset: number, dataObject)
		local id = buffer.readu32(b, offset)
		if id == 0 then
			return nil
		else
			local instance = dataObject:GetRootModel().Methods:GetDataObjectById(id).Instance
			return instance
		end
	end,

	TypeCheck = function(value)
		return value == nil or typeof(value) == "Instance"
	end,
	DataObjectTypeCheck = function(value)
		local DataObject = require("@DataObject") :: any
		return value == nil or DataObject.IsDataObjectInstance(value)
	end,

	IsInstance = true,
}

createDataObjectTypeInfo("Instance", DEFUALT_INSTANCE_DATA_TYPE_PARAMS)

for class, classInfo in ClassInfos do
	local classTag = `ExtendedInstance/{class}`
	createDataObjectTypeInfo(
		class,
		TableUtil.merge({
			TypeAnnotation = classInfo.RobloxClass,
			TypeCheck = function(value)
				return value == nil or value:HasTag(classTag)
			end,
			DataObjectTypeCheck = function(value)
				local DataObject = require("@DataObject") :: any
				return value == nil or DataObject.fromInstance(value):IsA(class)
			end,
		}, DEFUALT_INSTANCE_DATA_TYPE_PARAMS)
	)
end

function DataObjectTypeInfo:ConvertToTypeInfo(): TypeInfos.TypeInfo
	if self.IsInstance then
		return TypeInfos.Instance
	end

	return TypeInfos.GetTypeInfoByTypeName(self.Name)
end

-- Combine
for typeName, typeInfo in TypeInfos.GetTypeInfosByName() do
	-- DataObjectTypeInfos 에서 Instance 는 다른 Serialize/Deserialize 를 가지기 때문에,
	-- 패스합니다.
	if typeName == "Instance" then
		continue
	end

	createDataObjectTypeInfo(typeName, {
		Default = typeInfo.Default,
		TypeAnnotation = typeInfo.TypeAnnotation,

		Size = typeInfo.Size,
		GetSize = if typeInfo.Size == "Undefined" then typeInfo.GetSize else nil,

		Serialize = typeInfo.Serialize,
		Deserialize = typeInfo.Deserialize,
		TypeCheck = typeInfo.TypeCheck,

		IsEnum = typeInfo.IsEnum,
	})
end

do
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

	function DataObjectTypeInfos.GetTypeInfos(): { DataObjectTypeInfo }
		return typeInfosById
	end

	function DataObjectTypeInfos.GetTypeInfoByTypeId(id: number): DataObjectTypeInfo
		return typeInfosById[id] or error(`Invalid TypeInfo Id "{id}".`)
	end
end

function DataObjectTypeInfos.GetTypeInfosByName(): DataObjectTypeInfosByName
	return typeInfosByName
end

function DataObjectTypeInfos.GetTypeInfoByTypeName(name: string): DataObjectTypeInfo
	return typeInfosByName[name] or error(`Invalid Type "{name}", which is not a supported type.`)
end

function DataObjectTypeInfos.FindTypeInfoByValueType(value: any): DataObjectTypeInfo?
	return typeInfosByName[typeof(value)]
end

function DataObjectTypeInfos.GetTypeInfoByValueType(value: any): DataObjectTypeInfo
	return DataObjectTypeInfos.FindTypeInfoByValueType(value)
		or error(`Invalid Value "{value}", Type "{typeof(value)}" which is not a supported type.`)
end

return table.freeze(DataObjectTypeInfos) :: typeof(DataObjectTypeInfos) & DataObjectTypeInfosByName
