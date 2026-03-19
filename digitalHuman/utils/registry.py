# -*- coding: utf-8 -*-
'''
@File    :   registry.py
@Author  :   一力辉 
'''

__all__ = ['Registry']

def _register_generic(module_dict, module_name, module):
    assert module_name not in module_dict
    module_dict[module_name] = module
#它实现了一个通用的注册表 (Registry) 模式。你可以把它理解为一个**“人才登记处”或“社团花名册”
# registry.py 是项目实现模块化和可插拔架构的基石。我们看到的 ASREngines 就是用这个 Registry 类创建的一个实例。

class Registry(dict):
    def __init__(self, *args, **kwargs):
        super(Registry, self).__init__(*args, **kwargs)

    def register(self, module_name=None, module=None):
        # used as function call
        if module is not None:
            name = module_name if module_name else module.__name__
            _register_generic(self, name, module)
            return

        # used as decorator
        def register_fn(fn):
            name = module_name if module_name else fn.__name__
            _register_generic(self, name, fn)
            return fn

        return register_fn

    def list(self):
        return list(self.keys())